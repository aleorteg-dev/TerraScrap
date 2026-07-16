"""B5 – api-rest: FastAPI router factory."""

from __future__ import annotations

import base64
import logging
import math
import struct
import threading
import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Final, Literal

from fastapi import APIRouter, HTTPException, Query, Response, UploadFile
from fastapi.responses import JSONResponse

from twi.item_catalog import ItemCatalog, ItemCatalogUnavailableError, ItemNotFoundError
from twi.tile_search import SearchMatch, TileSearchEngine
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
    BackgroundStylesDto,
    ErrorDto,
    ImportJobCreatedDto,
    ImportJobStatusDto,
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

_ProgressFn = Callable[[int], None]
_ImportParserFn = Callable[[bytes, _ProgressFn | None], World]
_RunnerFn = Callable[[Callable[[], None]], None]


@dataclass
class _ImportJob:
    job_id: str
    status: Literal["queued", "processing", "done", "error"] = field(default="queued")
    pct: int = field(default=0)
    world_id: str | None = field(default=None)
    metadata: WorldMetadataDto | None = field(default=None)
    error_code: str | None = field(default=None)
    error_message: str | None = field(default=None)
    finished_at: datetime | None = field(default=None)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class _ImportJobStore:
    """Almacén de import jobs con retención TTL para estados terminales.

    Los jobs `done`/`error` expiran `ttl_seconds` después de `finished_at`;
    la purga es perezosa (en cada `add`/`get`), así el dict queda acotado
    sin tarea de fondo (contrato api-contract.md §2, IT-01).
    """

    def __init__(self, ttl_seconds: int, clock: Callable[[], datetime]) -> None:
        self._jobs: dict[str, _ImportJob] = {}
        self._ttl_seconds = ttl_seconds
        self._clock = clock
        self._lock = threading.Lock()

    def add(self, job: _ImportJob) -> None:
        with self._lock:
            self._purge_locked()
            self._jobs[job.job_id] = job

    def get(self, job_id: str) -> _ImportJob | None:
        with self._lock:
            self._purge_locked()
            return self._jobs.get(job_id)

    def __len__(self) -> int:
        with self._lock:
            return len(self._jobs)

    def _purge_locked(self) -> None:
        now = self._clock()
        expired = [
            job_id
            for job_id, job in self._jobs.items()
            if job.status in ("done", "error")
            and job.finished_at is not None
            and (now - job.finished_at).total_seconds() >= self._ttl_seconds
        ]
        for job_id in expired:
            del self._jobs[job_id]


def _thread_runner(fn: Callable[[], None]) -> None:
    threading.Thread(target=fn, daemon=True).start()


def _sync_runner(fn: Callable[[], None]) -> None:
    fn()


def _get_world_or_404(repo: WorldRepository, world_id: str) -> World:
    """Resolve a world or raise the canonical 404 (handled by errors.py)."""
    try:
        return repo.get(world_id)
    except WorldNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "world_not_found",
                "message": f"World '{world_id}' not found.",
            },
        ) from exc


_UPLOAD_CHUNK_BYTES: Final = 1024 * 1024


async def _read_upload_capped(file: UploadFile, max_bytes: int) -> bytes | None:
    """Read the upload in 1 MiB chunks; return None as soon as it exceeds max_bytes.

    Never buffers more than ``max_bytes + _UPLOAD_CHUNK_BYTES``, so oversized or
    chunked (no Content-Length) uploads cannot exhaust memory before the 413.
    """
    buf = bytearray()
    while True:
        chunk = await file.read(_UPLOAD_CHUNK_BYTES)
        if not chunk:
            return bytes(buf)
        buf.extend(chunk)
        if len(buf) > max_bytes:
            return None


def _upload_too_large_response(max_upload_mb: int) -> JSONResponse:
    """The canonical 413 response for uploads over the limit."""
    return error_response(
        413, UPLOAD_TOO_LARGE_CODE, f"File exceeds {max_upload_mb} MB limit."
    )


def _match_dto(m: SearchMatch) -> SearchMatchDto:
    return SearchMatchDto(
        x=m.x, y=m.y, source=m.source, chest_id=m.chest_id, stack=m.stack
    )


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
_UNPROCESSABLE_ENTITY_RESPONSE: Final[dict[str, object]] = {
    "model": ErrorDto,
    "description": "Unprocessable Entity",
}
_REQUEST_ENTITY_TOO_LARGE_RESPONSE: Final[dict[str, object]] = {
    "model": ErrorDto,
    "description": "Request Entity Too Large",
}

# Foreground / decorative tile IDs that must not count as the column "surface"
# even when they have no frame data. Trees, plants, vines, saplings, vanity
# trees, palms, bamboo, ropes, mushrooms and similar overgrowth sit above the
# real terrain; they cannot bury the sky band beneath them. Solid blocks
# (dirt, stone, sand, snow, ice, mud, ash, ...) are intentionally absent.
_SURFACE_FOREGROUND_TILE_IDS: Final[frozenset[int]] = frozenset(
    {
        3,  # Plants
        5,  # Tree
        20,  # Sapling
        24,  # Corruption plants
        27,  # Sunflower
        32,  # Corruption thorn
        51,  # Cobweb
        52,  # Vines
        61,  # Jungle plants
        62,  # Jungle vines
        69,  # Thorny bush
        71,
        72,  # Mushroom plants
        73,
        74,  # Grass plants
        80,  # Cactus (frame-tracked but explicit too)
        82,
        83,
        84,  # Herbs
        110,  # Hallow plants
        113,
        115,  # Hallow vines
        184,  # Stalactite gem
        185,
        186,
        187,  # Stalactites
        188,  # Cactus alt
        190,  # Glowing mushroom
        192,  # Leaves
        205,  # Crimson plants? Conservative
        213,  # Jungle thorn
        227,  # Dye plants
        233,  # Jungle plants alt
        236,  # Plantera bulb
        323,
        324,  # Palm tree / sapling
        352,  # Rope coil tile
        353,  # Rope
        365,
        366,  # Vine rope
        382,  # Seaweed
        485,  # Pine tree top
        518,
        519,  # Grass plants alt
        528,
        529,  # Sapling / mushroom alt
        583,
        584,
        585,
        586,
        587,
        588,
        589,
        590,  # Gem tree variants
        591,
        595,
        596,
        615,
        616,  # Tree / furniture variants
        634,
        637,
        638,  # Decorative / sandstone variants
        734,  # Reef plant
        735,  # Sunflower variant
    }
)


def _is_surface_blocking_tile(tile: Tile) -> bool:
    """True if this tile defines the terrain surface (blocks the sky).

    Skips air, frame-important decorations (trees, plants, furniture, chests,
    torches, platforms — anything whose sprite carries frame coords) and an
    explicit denylist of frameless foreground vegetation/ropes.
    """
    if tile.tile_id is None:
        return False
    if tile.frame_x is not None or tile.frame_y is not None:
        return False
    if tile.tile_id in _SURFACE_FOREGROUND_TILE_IDS:
        return False
    return True


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


def _chunk_surface_y(
    tiles: TileGrid,
    chunk_x: int,
    chunk_size: int,
    world_surface_y: float = 0.0,
) -> list[int]:
    """Return terrain surface Y per world column in the chunk.

    Ignores floating islands: solid runs whose bottom (run_end) lies strictly
    above floor(world_surface_y) cannot be the main terrain surface.
    Accepts mountains whose run starts above world_surface_y but extends through
    it (run_end >= threshold). Canyon columns where terrain begins below
    world_surface_y return that deeper y. When world_surface_y=0 (default) every
    run qualifies, reproducing the old first-solid-tile behaviour.
    """
    start_x = chunk_x * chunk_size
    w = min(chunk_size, max(0, tiles.width - start_x))
    threshold = max(0, int(math.floor(world_surface_y)))
    surface_y: list[int] = []
    for x in range(start_x, start_x + w):
        column = tiles[x]
        result = tiles.height
        in_run = False
        run_start = 0
        for y, tile in enumerate(column):
            blocking = _is_surface_blocking_tile(tile)
            if blocking and not in_run:
                in_run = True
                run_start = y
            elif not blocking and in_run:
                run_end = y - 1
                if run_end >= threshold:
                    result = run_start
                    break
                in_run = False
        else:
            if in_run and (tiles.height - 1) >= threshold:
                result = run_start
        surface_y.append(result)
    return surface_y


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
    parser: Callable[[bytes], World] = lambda data: parse_wld_bytes(data),
    max_upload_mb: int = 200,
    job_ttl_seconds: int = 900,
    _import_parser: _ImportParserFn | None = None,
    _job_runner: _RunnerFn | None = None,
    _clock: Callable[[], datetime] | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/api")
    clock: Callable[[], datetime] = _clock if _clock is not None else _utcnow
    jobs = _ImportJobStore(ttl_seconds=job_ttl_seconds, clock=clock)
    import_parser: _ImportParserFn = (
        _import_parser
        if _import_parser is not None
        else lambda data, cb: parse_wld_bytes(data, cb)
    )
    run_job: _RunnerFn = _job_runner if _job_runner is not None else _thread_runner

    @router.post(
        "/worlds",
        response_model=None,
        responses={
            200: {"model": WorldCreatedDto},
            400: {"model": ErrorDto},
            413: _REQUEST_ENTITY_TOO_LARGE_RESPONSE,
            422: _UNPROCESSABLE_ENTITY_RESPONSE,
        },
    )
    async def upload_world(file: UploadFile) -> Response:
        data = await _read_upload_capped(file, max_upload_mb * 1024 * 1024)
        if data is None:
            return _upload_too_large_response(max_upload_mb)
        try:
            world = parser(data)
        except UnsupportedWorldVersionError as exc:
            return error_response(
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
            return error_response(
                400,
                "invalid_wld",
                "File is not a valid .wld file.",
                {"parser_code": exc.code},
            )
        world_id = repo.store(world)
        return _ok(
            WorldCreatedDto(world_id=world_id, metadata=_meta_dto(world.metadata))
        )

    # ── Import jobs (progress-aware upload) ──────────────────────────────────

    @router.post(
        "/world-imports",
        response_model=None,
        responses={
            202: {"model": ImportJobCreatedDto},
            413: _REQUEST_ENTITY_TOO_LARGE_RESPONSE,
        },
    )
    async def create_import_job(file: UploadFile) -> Response:
        data = await _read_upload_capped(file, max_upload_mb * 1024 * 1024)
        if data is None:
            return _upload_too_large_response(max_upload_mb)
        job_id = str(uuid.uuid4())
        job = _ImportJob(job_id=job_id, status="queued", pct=0)
        jobs.add(job)

        def _do_import() -> None:
            job.status = "processing"

            def _on_progress(pct: int) -> None:
                job.pct = pct

            try:
                world = import_parser(data, _on_progress)
                world_id = repo.store(world)
                metadata_dto = _meta_dto(world.metadata)
            except UnsupportedWorldVersionError as exc:
                job.error_code = "unsupported_version"
                job.error_message = str(exc)
                job.finished_at = clock()
                job.status = "error"
                return
            except WldParseError as exc:
                logger.warning(
                    "WldParseError in import job %s: code=%s", job_id, exc.code
                )
                job.error_code = "invalid_wld"
                job.error_message = str(exc)
                job.finished_at = clock()
                job.status = "error"
                return
            except Exception:
                logger.exception("Unexpected error in import job %s", job_id)
                job.error_code = "import_failed"
                job.error_message = "Unexpected error during import."
                job.finished_at = clock()
                job.status = "error"
                return
            job.pct = 100
            job.world_id = world_id
            job.metadata = metadata_dto
            job.finished_at = clock()
            job.status = "done"

        run_job(_do_import)
        return JSONResponse(
            status_code=202,
            content=ImportJobCreatedDto(job_id=job_id).model_dump(),
            headers=API_VERSION_HEADERS,
        )

    @router.get(
        "/world-imports/{job_id}",
        response_model=None,
        responses={
            200: {"model": ImportJobStatusDto},
            404: {"model": ErrorDto},
        },
    )
    async def get_import_job(job_id: str) -> Response:
        job = jobs.get(job_id)
        if job is None:
            return error_response(
                404, "job_not_found", f"Import job '{job_id}' not found."
            )
        return JSONResponse(
            status_code=200,
            content=ImportJobStatusDto(
                job_id=job.job_id,
                status=job.status,
                pct=job.pct,
                world_id=job.world_id,
                metadata=job.metadata,
                error_code=job.error_code,
                error_message=job.error_message,
            ).model_dump(),
            headers=API_VERSION_HEADERS,
        )

    @router.get(
        "/worlds/{world_id}",
        response_model=None,
        responses={200: {"model": WorldMetadataDto}, 404: {"model": ErrorDto}},
    )
    async def get_world(world_id: str) -> Response:
        world = _get_world_or_404(repo, world_id)
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
            return error_response(
                404, "world_not_found", f"World '{world_id}' not found."
            )
        return Response(status_code=204, headers=API_VERSION_HEADERS)

    @router.get(
        "/worlds/{world_id}/tiles",
        response_model=None,
        responses={
            200: {"model": TilesChunkDto},
            404: {"model": ErrorDto},
            422: _UNPROCESSABLE_ENTITY_RESPONSE,
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
            return error_response(
                400,
                "invalid_encoding",
                f"Unsupported encoding '{encoding}'.",
                {"supported": sorted(_SUPPORTED_ENCODINGS)},
            )
        world = _get_world_or_404(repo, world_id)
        wsurface = (
            world.metadata.world_surface_y
            if world.metadata.world_surface_y is not None
            else 0.0
        )
        enc_name: Literal["base64-rle-v1", "base64-rle-v2"] = (
            "base64-rle-v2" if encoding == "base64-rle-v2" else "base64-rle-v1"
        )
        encode = _encode_chunk_v2 if enc_name == "base64-rle-v2" else _encode_chunk
        w, h, payload = encode(world.tiles, chunk_x, chunk_y, chunk_size)
        return _ok(
            TilesChunkDto(
                chunk_x=chunk_x,
                chunk_y=chunk_y,
                width=w,
                height=h,
                encoding=enc_name,
                payload=payload,
                surface_y=_chunk_surface_y(world.tiles, chunk_x, chunk_size, wsurface),
            )
        )

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
        world = _get_world_or_404(repo, world_id)
        w, h = world.tiles.width, world.tiles.height
        if x < 0 or y < 0 or x >= w or y >= h:
            return error_response(
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
        world = _get_world_or_404(repo, world_id)
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
            422: _UNPROCESSABLE_ENTITY_RESPONSE,
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
            return error_response(
                400, "invalid_item_id", "Query parameter 'item_id' is required."
            )
        world = _get_world_or_404(repo, world_id)
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
                        filtered.append(_match_dto(m))
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
                matches=[_match_dto(m) for m in result.matches],
            )
        )

    @router.get(
        "/items",
        response_model=None,
        responses={
            200: {"model": ItemListDto},
            422: _UNPROCESSABLE_ENTITY_RESPONSE,
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
            return error_response(
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
            422: _UNPROCESSABLE_ENTITY_RESPONSE,
            503: {"model": ErrorDto},
        },
    )
    async def get_item(item_id: int) -> Response:
        try:
            detail = catalog.get(item_id)
        except ItemNotFoundError:
            return error_response(
                404, "item_not_found", f"Item {item_id} not found in catalog."
            )
        except ItemCatalogUnavailableError:
            return error_response(
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
