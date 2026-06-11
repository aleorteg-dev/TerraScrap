"""B5 – api-rest: FastAPI router factory."""

from __future__ import annotations

import base64
import logging
import struct
from collections.abc import Callable, Mapping
from typing import Final

from fastapi import APIRouter, Query, Response, UploadFile
from fastapi.responses import JSONResponse

from twi.item_catalog import ItemCatalog, ItemCatalogUnavailableError, ItemNotFoundError
from twi.tile_search import TileSearchEngine
from twi.wld_parser import (
    Tile,
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
    BackgroundStylesDto,
    ErrorDto,
    ItemDetailDto,
    ItemListDto,
    ItemSummaryDto,
    NpcDto,
    NpcListDto,
    SearchMatchDto,
    SearchResultDto,
    TileDetailDto,
    TilesChunkDto,
    WorldCreatedDto,
    WorldMetadataDto,
)

logger = logging.getLogger(__name__)


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
    | NpcListDto
    | TileDetailDto
)


def _ok(dto: _OkDto) -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content=dto.model_dump(),
        headers=API_VERSION_HEADERS,
    )


def _meta_dto(m: WorldMetadata) -> WorldMetadataDto:
    bg = m.background_styles
    bg_dto = (
        BackgroundStylesDto(
            moon_style=bg.moon_style,
            tree_x=bg.tree_x,
            tree_style=bg.tree_style,
            cave_back_x=bg.cave_back_x,
            cave_back_style=bg.cave_back_style,
            ice_back_style=bg.ice_back_style,
            jungle_back_style=bg.jungle_back_style,
            hell_back_style=bg.hell_back_style,
        )
        if bg is not None
        else None
    )
    return WorldMetadataDto(
        name=m.name,
        width=m.width,
        height=m.height,
        version=m.version,
        seed=m.seed,
        size=m.size,
        hardmode=m.hardmode,
        spawn_x=m.spawn_x,
        spawn_y=m.spawn_y,
        world_surface_y=m.world_surface_y,
        rock_layer_y=m.rock_layer_y,
        hell_layer_y=m.hell_layer_y,
        background_styles=bg_dto,
    )


_LIQUID_TYPE_TO_INT: Final[Mapping[str, int]] = {
    "none": 0,
    "water": 1,
    "lava": 2,
    "honey": 3,
    "shimmer": 4,
}

_SUPPORTED_ENCODINGS: Final[frozenset[str]] = frozenset(
    {"base64-rle-v1", "base64-rle-v2"}
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


def _tile_eq_v2(a: Tile, b: Tile) -> bool:
    return (
        a.tile_id == b.tile_id
        and a.wall_id == b.wall_id
        and a.liquid_type == b.liquid_type
        and a.liquid_amount == b.liquid_amount
        and a.frame_x == b.frame_x
        and a.frame_y == b.frame_y
    )


def _encode_chunk_v2(
    tiles: TileGrid,
    chunk_x: int,
    chunk_y: int,
    chunk_size: int,
) -> tuple[int, int, str]:
    """Pack a grid chunk as base64-rle-v2.

    Layout: HEADER (8B "TWv2" + frame_count u16LE + reserved u16LE)
            + RUNS (10B each: tile_id i16, wall_id u16, liquid_type u8,
                    liquid_amount u8, frame_x_hi u8, flags u8, count u16)
            + FRAME_BLOCK (6B per entry: run_index u16, frame_x_lo u8,
                    reserved u8, frame_y u16) when frame_count > 0.
    flags bit 0 = has_frame. Bits 1..5 (actuator/wires) reserved as 0
    until raw Tile.flags is decomposed (deuda).
    """
    start_x, start_y, w, h = _chunk_bounds(
        chunk_x, chunk_y, chunk_size, tiles.width, tiles.height
    )

    flat: list[Tile] = []
    for y in range(start_y, start_y + h):
        for x in range(start_x, start_x + w):
            flat.append(tiles[x][y])

    runs_buf = bytearray()
    frame_buf = bytearray()
    frame_count = 0
    run_idx = 0

    i = 0
    while i < len(flat):
        cur = flat[i]
        run = 1
        while run < 65535 and i + run < len(flat) and _tile_eq_v2(flat[i + run], cur):
            run += 1

        # `_read_tiles` produces frame_x/frame_y as signed int16 and tile_id /
        # wall_id from uint16 reads. We store the raw 16-bit bit pattern
        # (two's complement) so the format is robust to negative or full-range
        # values without raising `struct.error`. Decoders treat tile_id as
        # int16 (so 0xFFFF round-trips to -1 = air) and frame coords as the
        # underlying signed int16 bit pattern.
        tile_id_raw = 0xFFFF if cur.tile_id is None else cur.tile_id & 0xFFFF
        wall_id_raw = (cur.wall_id or 0) & 0xFFFF
        liq_t = _LIQUID_TYPE_TO_INT[cur.liquid_type]
        liq_a = cur.liquid_amount & 0xFF
        if cur.frame_x is not None and cur.frame_y is not None:
            fx_u16 = cur.frame_x & 0xFFFF
            fy_u16 = cur.frame_y & 0xFFFF
            fx_hi = (fx_u16 >> 8) & 0xFF
            fx_lo = fx_u16 & 0xFF
            flags_byte = 0x01
            frame_buf.extend(struct.pack("<HBBH", run_idx, fx_lo, 0, fy_u16))
            frame_count += 1
        else:
            fx_hi = 0
            flags_byte = 0

        runs_buf.extend(
            struct.pack(
                "<HHBBBBH",
                tile_id_raw,
                wall_id_raw,
                liq_t,
                liq_a,
                fx_hi,
                flags_byte,
                run,
            )
        )
        i += run
        run_idx += 1

    header = struct.pack("<4sHH", b"TWv2", frame_count, 0)
    payload = header + bytes(runs_buf) + bytes(frame_buf)
    return w, h, base64.b64encode(payload).decode()


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
        except WldParseError as exc:
            logger.warning(
                "WldParseError parsing upload: code=%s details=%s",
                exc.code,
                exc.details,
            )
            return _err(
                400,
                "invalid_wld",
                "File is not a valid .wld file.",
                {"parser_code": exc.code},
            )
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
        encoding: str = Query(default="base64-rle-v1"),
    ) -> Response:
        if encoding not in _SUPPORTED_ENCODINGS:
            return _err(
                400,
                "invalid_encoding",
                f"Unsupported encoding '{encoding}'.",
                {"supported": sorted(_SUPPORTED_ENCODINGS)},
            )
        try:
            world = repo.get(world_id)
        except WorldNotFoundError:
            return _err(404, "world_not_found", f"World '{world_id}' not found.")
        if encoding == "base64-rle-v2":
            w, h, payload = _encode_chunk_v2(world.tiles, chunk_x, chunk_y, chunk_size)
            enc: TilesChunkDto = TilesChunkDto(
                chunk_x=chunk_x,
                chunk_y=chunk_y,
                width=w,
                height=h,
                encoding="base64-rle-v2",
                payload=payload,
            )
        else:
            w, h, payload = _encode_chunk(world.tiles, chunk_x, chunk_y, chunk_size)
            enc = TilesChunkDto(
                chunk_x=chunk_x,
                chunk_y=chunk_y,
                width=w,
                height=h,
                encoding="base64-rle-v1",
                payload=payload,
            )
        return _ok(enc)

    @router.get(
        "/worlds/{world_id}/tile",
        response_model=None,
        responses={
            200: {"model": TileDetailDto},
            400: {"model": ErrorDto},
            404: {"model": ErrorDto},
        },
    )
    async def get_tile(world_id: str, x: int, y: int) -> Response:
        try:
            world = repo.get(world_id)
        except WorldNotFoundError:
            return _err(404, "world_not_found", f"World '{world_id}' not found.")
        w, h = world.tiles.width, world.tiles.height
        if x < 0 or y < 0 or x >= w or y >= h:
            return _err(
                400,
                "coordinates_out_of_bounds",
                f"Coordinates ({x}, {y}) are out of bounds for world {w}x{h}.",
                {"x": x, "y": y, "width": w, "height": h},
            )
        tile = world.tiles[x][y]
        chest_id: int | None = None
        for c in world.chests:
            if c.x == x and c.y == y:
                chest_id = c.chest_id
                break
        sign_id: int | None = None
        for idx, s in enumerate(world.signs):
            if s.x == x and s.y == y:
                sign_id = idx
                break
        tile_entity_id: int | None = None
        for te in world.tile_entities:
            if te.x == x and te.y == y:
                tile_entity_id = te.id
                break
        return _ok(
            TileDetailDto(
                x=x,
                y=y,
                tile_id=tile.tile_id,
                wall_id=tile.wall_id,
                liquid_type=tile.liquid_type,
                liquid_amount=tile.liquid_amount,
                frame_x=tile.frame_x,
                frame_y=tile.frame_y,
                chest_id=chest_id,
                sign_id=sign_id,
                tile_entity_id=tile_entity_id,
            )
        )

    @router.get(
        "/worlds/{world_id}/npcs",
        response_model=None,
        responses={
            200: {"model": NpcListDto},
            404: {"model": ErrorDto},
        },
    )
    async def get_npcs(
        world_id: str,
        town_only: bool = Query(default=False),
    ) -> Response:
        try:
            world = repo.get(world_id)
        except WorldNotFoundError:
            return _err(404, "world_not_found", f"World '{world_id}' not found.")
        npcs = [
            NpcDto(
                id=n.id,
                name=n.name,
                type="town" if n.is_town_npc else "banner",
                x=int(n.position_x),
                y=int(n.position_y),
            )
            for n in world.npcs
            if not town_only or n.is_town_npc
        ]
        return _ok(NpcListDto(npcs=npcs))

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
        frame_x: int | None = Query(default=None),
        frame_y: int | None = Query(default=None),
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
        matches = result.matches
        if frame_x is not None or frame_y is not None:
            tiles = world.tiles
            w, h = tiles.width, tiles.height
            filtered: list[SearchMatchDto] = []
            for m in matches:
                if 0 <= m.x < w and 0 <= m.y < h:
                    t = tiles[m.x][m.y]
                    if (frame_x is None or t.frame_x == frame_x) and (
                        frame_y is None or t.frame_y == frame_y
                    ):
                        filtered.append(
                            SearchMatchDto(
                                x=m.x,
                                y=m.y,
                                source=m.source,
                                chest_id=m.chest_id,
                                stack=m.stack,
                            )
                        )
            return _ok(
                SearchResultDto(
                    item_id=result.item_id,
                    total=len(filtered),
                    matches=filtered,
                )
            )
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
