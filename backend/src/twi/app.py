"""B6 – app-bootstrap: FastAPI application factory."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings, SettingsConfigDict
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from twi.api_rest import (
    UploadTooLargeError,
    XApiVersionMiddleware,
    create_router,
    register_error_handlers,
)
from twi.item_catalog import (
    ItemCatalog,
    ItemCatalogUnavailableError,
    ItemDetail,
    ItemSummary,
    load_catalog,
)
from twi.tile_search import create_tile_search_engine
from twi.world_repository import WorldRepository, create_in_memory_repository

_DEFAULT_SEED_PATH: Path = (
    Path(__file__).parent / "item_catalog" / "data" / "items.seed.json"
)

_LOG_LEVELS: dict[str, int] = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TWI_")

    max_upload_mb: int = 200
    item_cache_path: Path = Path("data/items.json")
    item_seed_path: Path = _DEFAULT_SEED_PATH
    world_ttl_seconds: int = 1800
    cors_origins: list[str] = ["http://localhost:5173"]
    log_level: str = "INFO"
    purge_interval_seconds: int = 60


class _UploadSizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        super().__init__(app)
        self._max_bytes = max_bytes

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        content_length = request.headers.get("Content-Length")
        if content_length is not None and int(content_length) > self._max_bytes:
            limit_mb = self._max_bytes // (1024 * 1024)
            raise UploadTooLargeError(limit_mb)
        return await call_next(request)


class _NullCatalog:
    """Placeholder when item cache is unavailable at startup; all calls raise."""

    def search(self, query: str, limit: int = 20) -> list[ItemSummary]:
        raise ItemCatalogUnavailableError("Item catalog unavailable.")

    def get(self, item_id: int) -> ItemDetail:
        raise ItemCatalogUnavailableError("Item catalog unavailable.")


async def _purge_loop(repo: WorldRepository, interval: int) -> None:
    while True:
        await asyncio.sleep(interval)
        repo.purge_expired()


def create_app(settings: Settings | None = None) -> FastAPI:
    if settings is None:
        settings = Settings()

    log_level = _LOG_LEVELS.get(settings.log_level.upper(), logging.INFO)
    logging.basicConfig(level=log_level, force=True)

    repo = create_in_memory_repository(ttl_seconds=settings.world_ttl_seconds)

    catalog: ItemCatalog
    try:
        catalog = load_catalog(settings.item_cache_path, settings.item_seed_path)
    except ItemCatalogUnavailableError:
        logging.warning(
            "Item catalog unavailable (cache=%s, seed=%s); "
            "/api/items returns empty results.",
            settings.item_cache_path,
            settings.item_seed_path,
        )
        catalog = _NullCatalog()

    search = create_tile_search_engine()
    router = create_router(
        repo=repo,
        catalog=catalog,
        search=search,
        max_upload_mb=settings.max_upload_mb,
    )

    interval = settings.purge_interval_seconds

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
        task = asyncio.create_task(_purge_loop(repo, interval))
        try:
            yield
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    fastapi_app = FastAPI(lifespan=lifespan, title="TerraScrap API")
    register_error_handlers(fastapi_app)

    # Size-limit middleware added first (inner); API version and CORS wrap it so
    # their headers are present even on 413 responses.
    fastapi_app.add_middleware(
        _UploadSizeLimitMiddleware,
        max_bytes=settings.max_upload_mb * 1024 * 1024,
    )
    fastapi_app.add_middleware(XApiVersionMiddleware)
    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    fastapi_app.include_router(router)

    @fastapi_app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return fastapi_app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("twi.app:create_app", factory=True, host="0.0.0.0", port=8000)
