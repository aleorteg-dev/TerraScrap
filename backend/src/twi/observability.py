"""Structured logging and request correlation for the FastAPI app.

Provides a JSON formatter for stdlib ``logging`` and a Starlette middleware
that:

* assigns a UUID v4 ``X-Request-Id`` per request (or honours one supplied by
  the client),
* emits a structured access log entry per request,
* attaches the request id to the response so the client can correlate logs.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import UTC, datetime
from typing import Final

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from twi.api_rest.errors import ERROR_CODE_HEADER, REQUEST_ID_HEADER

ACCESS_LOGGER_NAME: Final = "twi.access"
PURGE_LOGGER_NAME: Final = "twi.purge"

_LOG_EXTRA_FIELDS: Final[tuple[str, ...]] = (
    "request_id",
    "method",
    "path",
    "status",
    "duration_ms",
    "event",
)


class JsonFormatter(logging.Formatter):
    """Render LogRecords as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        timestamp = (
            datetime.fromtimestamp(record.created, tz=UTC)
            .isoformat()
            .replace("+00:00", "Z")
        )
        payload: dict[str, object] = {
            "timestamp": timestamp,
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in _LOG_EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        error_code = getattr(record, "error_code", None)
        if error_code is not None:
            payload["error"] = {"code": error_code}
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: int) -> None:
    """Install the JSON formatter on the root logger.

    ``force=True``-style behaviour: removes existing handlers so we don't end
    up with duplicate or unstructured output (uvicorn reloaders may install
    text handlers before us).
    """
    root = logging.getLogger()
    for handler in list(root.handlers):
        root.removeHandler(handler)
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    root.setLevel(level)


_UUID_V4_RE_LEN: Final = 36


def _looks_like_uuid(value: str) -> bool:
    return len(value) == _UUID_V4_RE_LEN and value.count("-") == 4


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assign a request id, log the access entry, propagate the header."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._logger = logging.getLogger(ACCESS_LOGGER_NAME)

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        incoming = request.headers.get(REQUEST_ID_HEADER, "").strip()
        request_id = (
            incoming if incoming and _looks_like_uuid(incoming) else str(uuid.uuid4())
        )
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000.0, 3)
            self._log(
                level=logging.ERROR,
                message="request_failed",
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                status=500,
                duration_ms=duration_ms,
                error_code="internal_error",
            )
            raise
        duration_ms = round((time.perf_counter() - start) * 1000.0, 3)
        response.headers[REQUEST_ID_HEADER] = request_id
        error_code = response.headers.get(ERROR_CODE_HEADER)
        if error_code is not None:
            del response.headers[ERROR_CODE_HEADER]
        self._log(
            level=logging.INFO,
            message="request_completed",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
            error_code=error_code,
        )
        return response

    def _log(
        self,
        *,
        level: int,
        message: str,
        request_id: str,
        method: str,
        path: str,
        status: int,
        duration_ms: float,
        error_code: str | None,
    ) -> None:
        extra: dict[str, object] = {
            "request_id": request_id,
            "method": method,
            "path": path,
            "status": status,
            "duration_ms": duration_ms,
        }
        if error_code is not None:
            extra["error_code"] = error_code
        self._logger.log(level, message, extra=extra)
