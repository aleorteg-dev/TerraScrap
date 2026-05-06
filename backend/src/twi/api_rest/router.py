"""B5 – api-rest: FastAPI router factory."""

from __future__ import annotations

import base64
import struct
from collections.abc import Callable

from fastapi import APIRouter, Query, Response, UploadFile
from fastapi.responses import JSONResponse

from twi.item_catalog import ItemCatalog, ItemCatalogUnavailableError, ItemNotFoundError
from twi.tile_search import TileSearchEngine
from twi.wld_parser import (
    TileGrid,
    UnsupportedWorldVersionError,
    WldParseError,
    World,
    WorldMetadata,
    parse_wld_bytes,
)
from twi.world_repository import WorldNotFoundError, WorldRepository

from .errors import API_VERSION_HEADERS, UPLOAD_TOO_LARGE_CODE, error_response
from .schemas import (
    ErrorDetails,
    ErrorDto,
    ItemDetailDto,
    ItemListDto,
    ItemSummaryDto,
    SearchMatchDto,
    SearchResultDto,
    TilesChunkDto,
    WorldCreatedDto,
    WorldMetadataDto,
)


def _err(
    status: int,
    code: str,
    message: str,
    details: ErrorDetails | None = None,
) -> JSONResponse:
    return error_response(status, code, message, details)


_OkDto = (
    WorldCreatedDto
    | WorldMetadataDto
    | SearchResultDto
    | ItemListDto
    | ItemDetailDto
    | TilesChunkDto
)


def _ok(dto: _OkDto) -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content=dto.model_dump(),
        headers=API_VERSION_HEADERS,
    )


def _meta_dto(m: WorldMetadata) -> WorldMetadataDto:
    return WorldMetadataDto(
        name=m.name,
        width=m.width,
        height=m.height,
        version=m.version,
        seed=m.seed,
        size=m.size,
        hardmode=m.hardmode,
    )


def _chunk_bounds(
    cx: int,
    cy: int,
    size: int,
    world_w: int,
    world_h: int,
) -> tuple[int, int, int, int]:
    """Return (start_x, start_y, width, height) for chunk index (cx, cy)."""
    start_x = cx * size
    start_y = cy * size
    w = min(size, max(0, world_w - start_x))
    h = min(size, max(0, world_h - start_y))
    return start_x, start_y, w, h


def _encode_chunk(
    tiles: TileGrid,
    chunk_x: int,
    chunk_y: int,
    chunk_size: int,
) -> tuple[int, int, str]:
    """Pack a grid chunk as base64-rle-v1.

    chunk_x / chunk_y are chunk *indices* (multiply by chunk_size to get tile coords).
    Flat tile_id array in row-major order (y outer, x inner), then RLE-compressed.
    Each run: (tileId: int16LE, count: uint16LE) = 4 bytes. Air (None) → -1.
    Max run length: 65535 (uint16 max).
    """
    start_x, start_y, w, h = _chunk_bounds(
        chunk_x, chunk_y, chunk_size, tiles.width, tiles.height
    )

    tile_ids: list[int] = []
    for y in range(start_y, start_y + h):
        for x in range(start_x, start_x + w):
            tile = tiles[x][y]
            tile_ids.append(-1 if tile.tile_id is None else tile.tile_id)

    buf = bytearray()
    i = 0
    while i < len(tile_ids):
        run = 1
        while (
            run < 65535 and i + run < len(tile_ids) and tile_ids[i + run] == tile_ids[i]
        ):
            run += 1
        buf.extend(struct.pack("<hH", tile_ids[i], run))
        i += run

    return w, h, base64.b64encode(bytes(buf)).decode()


def create_router(
    repo: WorldRepository,
    catalog: ItemCatalog,
    search: TileSearchEngine,
    parser: Callable[[bytes], World] = parse_wld_bytes,
    max_upload_mb: int = 200,
) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post(
        "/worlds",
        response_model=None,
        responses={
            200: {"model": WorldCreatedDto},
            400: {"model": ErrorDto},
            413: {"model": ErrorDto},
            422: {"model": ErrorDto},
        },
    )
    async def upload_world(file: UploadFile) -> Response:
        data = await file.read()
        if len(data) > max_upload_mb * 1024 * 1024:
            return _err(
                413, UPLOAD_TOO_LARGE_CODE, f"File exceeds {max_upload_mb} MB limit."
            )
        try:
            world = parser(data)
        except UnsupportedWorldVersionError as exc:
            return _err(
                422,
                "unsupported_version",
                str(exc),
                {"version": exc.version},
            )
        except WldParseError:
            return _err(400, "invalid_wld", "File is not a valid .wld file.")
        world_id = repo.store(world)
        return _ok(
            WorldCreatedDto(world_id=world_id, metadata=_meta_dto(world.metadata))
        )

    @router.get(
        "/worlds/{world_id}",
        response_model=None,
        responses={200: {"model": WorldMetadataDto}, 404: {"model": ErrorDto}},
    )
    async def get_world(world_id: str) -> Response:
        try:
            world = repo.get(world_id)
        except WorldNotFoundError:
            return _err(404, "world_not_found", f"World '{world_id}' not found.")
        return _ok(_meta_dto(world.metadata))

    @router.delete(
        "/worlds/{world_id}",
        response_model=None,
        responses={204: {}, 404: {"model": ErrorDto}},
    )
    async def delete_world(world_id: str) -> Response:
        try:
            repo.delete_strict(world_id)
        except WorldNotFoundError:
            return _err(404, "world_not_found", f"World '{world_id}' not found.")
        return Response(status_code=204, headers=API_VERSION_HEADERS)

    @router.get(
        "/worlds/{world_id}/tiles",
        response_model=None,
        responses={
            200: {"model": TilesChunkDto},
            404: {"model": ErrorDto},
            422: {"model": ErrorDto},
        },
    )
    async def get_tiles(
        world_id: str,
        chunk_x: int = Query(default=0, ge=0),
        chunk_y: int = Query(default=0, ge=0),
        chunk_size: int = Query(default=128, ge=1, le=512),
    ) -> Response:
        try:
            world = repo.get(world_id)
        except WorldNotFoundError:
            return _err(404, "world_not_found", f"World '{world_id}' not found.")
        w, h, payload = _encode_chunk(world.tiles, chunk_x, chunk_y, chunk_size)
        return _ok(
            TilesChunkDto(
                chunk_x=chunk_x,
                chunk_y=chunk_y,
                width=w,
                height=h,
                encoding="base64-rle-v1",
                payload=payload,
            )
        )

    @router.get(
        "/worlds/{world_id}/search",
        response_model=None,
        responses={
            200: {"model": SearchResultDto},
            400: {"model": ErrorDto},
            404: {"model": ErrorDto},
            422: {"model": ErrorDto},
        },
    )
    async def search_world(
        world_id: str,
        item_id: int | None = Query(default=None),
        include_containers: bool = Query(default=True),
    ) -> Response:
        if item_id is None:
            return _err(
                400, "invalid_item_id", "Query parameter 'item_id' is required."
            )
        try:
            world = repo.get(world_id)
        except WorldNotFoundError:
            return _err(404, "world_not_found", f"World '{world_id}' not found.")
        result = search.search(world, item_id, include_containers)
        return _ok(
            SearchResultDto(
                item_id=result.item_id,
                total=result.total,
                matches=[
                    SearchMatchDto(
                        x=m.x,
                        y=m.y,
                        source=m.source,
                        chest_id=m.chest_id,
                        stack=m.stack,
                    )
                    for m in result.matches
                ],
            )
        )

    @router.get(
        "/items",
        response_model=None,
        responses={
            200: {"model": ItemListDto},
            422: {"model": ErrorDto},
            503: {"model": ErrorDto},
        },
    )
    async def list_items(
        q: str = Query(default=""),
        limit: int = Query(default=20, ge=1, le=100),
    ) -> Response:
        try:
            summaries = catalog.search(q, limit)
        except ItemCatalogUnavailableError:
            return _err(
                503,
                "catalog_unavailable",
                "Item catalog is not available. Try again later.",
            )
        return _ok(
            ItemListDto(
                items=[
                    ItemSummaryDto(
                        id=s.id,
                        name=s.name,
                        sprite_url=s.sprite_url,
                        category=s.category,
                    )
                    for s in summaries
                ]
            )
        )

    @router.get(
        "/items/{item_id}",
        response_model=None,
        responses={
            200: {"model": ItemDetailDto},
            404: {"model": ErrorDto},
            422: {"model": ErrorDto},
            503: {"model": ErrorDto},
        },
    )
    async def get_item(item_id: int) -> Response:
        try:
            detail = catalog.get(item_id)
        except ItemNotFoundError:
            return _err(404, "item_not_found", f"Item {item_id} not found in catalog.")
        except ItemCatalogUnavailableError:
            return _err(
                503,
                "catalog_unavailable",
                "Item catalog is not available. Try again later.",
            )
        return _ok(
            ItemDetailDto(
                id=detail.id,
                name=detail.name,
                sprite_url=detail.sprite_url,
                category=detail.category,
                rarity=detail.rarity,
            )
        )

    return router
