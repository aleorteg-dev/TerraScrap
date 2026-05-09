"""HTTP error contract for B5 - api-rest."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from http import HTTPStatus
from typing import Final, TypeGuard

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from twi.api_rest.schemas import ErrorDetailDto, ErrorDetails, ErrorDto

API_VERSION: Final = "v0.1.0"
API_VERSION_HEADER: Final = "X-API-Version"
API_VERSION_HEADERS: Final[Mapping[str, str]] = {API_VERSION_HEADER: API_VERSION}

UPLOAD_TOO_LARGE_CODE: Final = "upload_too_large"
VALIDATION_ERROR_CODE: Final = "validation_error"
INTERNAL_ERROR_CODE: Final = "internal_error"

ERROR_CODE_HEADER: Final = "X-Error-Code"

STATUS_CODE_TO_ERROR_CODE: Final[Mapping[int, str]] = {
    404: "world_not_found",
    413: UPLOAD_TOO_LARGE_CODE,
    422: VALIDATION_ERROR_CODE,
    500: INTERNAL_ERROR_CODE,
}


class UploadTooLargeError(Exception):
    """Raised when the request body exceeds the configured upload limit."""

    def __init__(self, limit_mb: int) -> None:
        self.limit_mb = limit_mb
        super().__init__(f"Request body exceeds the {limit_mb} MB limit.")


class XApiVersionMiddleware(BaseHTTPMiddleware):
    """Attach X-API-Version to every HTTP response."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        try:
            response = await call_next(request)
        except UploadTooLargeError as exc:
            response = _upload_too_large_response(exc)
        response.headers[API_VERSION_HEADER] = API_VERSION
        return response


def error_code_for_status(status_code: int) -> str:
    return STATUS_CODE_TO_ERROR_CODE.get(status_code, "http_error")


def error_response(
    status_code: int,
    code: str,
    message: str,
    details: ErrorDetails | None = None,
) -> JSONResponse:
    body = ErrorDto(error=ErrorDetailDto(code=code, message=message, details=details))
    headers = {**API_VERSION_HEADERS, ERROR_CODE_HEADER: code}
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(mode="json"),
        headers=headers,
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return error_response(
            422,
            VALIDATION_ERROR_CODE,
            "Request validation failed.",
            _normalize_validation_errors(exc.errors()),
        )

    @app.exception_handler(UploadTooLargeError)
    async def upload_too_large_exception_handler(
        _request: Request, exc: UploadTooLargeError
    ) -> JSONResponse:
        return _upload_too_large_response(exc)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        parsed = _parse_error_detail(exc.detail)
        if parsed is not None:
            code, message, details = parsed
            return error_response(exc.status_code, code, message, details)
        return error_response(
            exc.status_code,
            error_code_for_status(exc.status_code),
            _http_message(exc.status_code, exc.detail),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        _request: Request, _exc: Exception
    ) -> JSONResponse:
        return error_response(
            500,
            INTERNAL_ERROR_CODE,
            "Internal server error.",
        )


def _upload_too_large_response(exc: UploadTooLargeError) -> JSONResponse:
    return error_response(
        413,
        UPLOAD_TOO_LARGE_CODE,
        str(exc),
    )


def _http_message(status_code: int, detail: object) -> str:
    if isinstance(detail, str) and detail:
        return detail
    try:
        return HTTPStatus(status_code).phrase
    except ValueError:
        return "HTTP error"


def _parse_error_detail(
    detail: object,
) -> tuple[str, str, ErrorDetails | None] | None:
    if not isinstance(detail, Mapping):
        return None
    code = detail.get("code")
    message = detail.get("message")
    details = detail.get("details")
    if not isinstance(code, str) or not isinstance(message, str):
        return None
    if _is_error_details(details):
        return code, message, details
    return code, message, None


def _is_error_details(value: object) -> TypeGuard[ErrorDetails]:
    if isinstance(value, Mapping):
        return True
    if isinstance(value, list):
        return all(isinstance(item, Mapping) for item in value)
    return False


def _normalize_validation_errors(
    errors: Iterable[object],
) -> list[Mapping[str, object]]:
    details: list[Mapping[str, object]] = []
    for error in errors:
        if not isinstance(error, Mapping):
            details.append({"message": str(error)})
            continue

        message = error.get("msg")
        error_type = error.get("type")
        normalized: dict[str, object] = {
            "loc": _normalize_location(error.get("loc")),
            "message": message if isinstance(message, str) else str(message),
        }
        if isinstance(error_type, str):
            normalized["type"] = error_type
        details.append(normalized)
    return details


def _normalize_location(value: object) -> list[str | int]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [part if isinstance(part, int) else str(part) for part in value]
    return [str(value)]
