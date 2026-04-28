"""Core parsing logic for .wld files (Terraria v230–v279)."""

from __future__ import annotations

from typing import BinaryIO

from twi.wld_parser._exceptions import UnsupportedWorldVersionError, WldParseError
from twi.wld_parser._reader import Reader
from twi.wld_parser._types import (
    Chest,
    ChestItem,
    Sign,
    Tile,
    TileGrid,
    World,
    WorldMetadata,
)

_MAGIC = b"relogic"
_FILE_TYPE_WORLD: int = 2
_MIN_VERSION: int = 230
_MAX_VERSION: int = 279
_CHEST_CAPACITY: int = 40


def _classify_size(width: int) -> str:
    if width <= 4200:
        return "small"
    if width <= 6400:
        return "medium"
    return "large"


# ── file header ──────────────────────────────────────────────────────────────


def _read_file_header(r: Reader) -> tuple[int, list[int], list[bool]]:
    """Return (version, section_offsets, tile_frame_important)."""
    version = r.read_int32()

    magic = r.read_bytes(7)
    if magic != _MAGIC:
        raise WldParseError(
            f"Invalid .wld magic bytes: {magic!r}.", code="invalid_header"
        )

    file_type = r.read_byte()
    if file_type != _FILE_TYPE_WORLD:
        raise WldParseError(
            f"File type {file_type} is not a world (expected 2).",
            code="invalid_header",
        )

    if version < _MIN_VERSION or version > _MAX_VERSION:
        raise UnsupportedWorldVersionError(version)

    _revision = r.read_uint32()
    _favorites = r.read_uint64()

    num_sections = r.read_int16()
    if num_sections < 4:
        raise WldParseError(
            f"Too few sections: {num_sections} (need at least 4).",
            code="corrupt",
        )
    offsets = [r.read_int32() for _ in range(num_sections)]

    num_tile_types = r.read_int16()
    num_bytes = (num_tile_types + 7) // 8
    raw = r.read_bytes(num_bytes)
    tfi: list[bool] = []
    for byte_val in raw:
        for bit in range(8):
            tfi.append(bool(byte_val & (1 << bit)))
    # Trim to exact count (last byte may have padding bits)
    tfi = tfi[:num_tile_types]

    return version, offsets, tfi


# ── section 0: world info ────────────────────────────────────────────────────


def _read_world_info(r: Reader, version: int) -> WorldMetadata:
    name = r.read_net_string()
    seed = r.read_net_string()
    _world_gen_version = r.read_uint64()
    _guid = r.read_bytes(16)
    _world_id = r.read_int32()

    # Bounds (pixels = tiles * 16)
    _left = r.read_int32()
    _right = r.read_int32()
    _top = r.read_int32()
    _bottom = r.read_int32()

    max_tiles_y = r.read_int32()  # height
    max_tiles_x = r.read_int32()  # width

    # v225+ game mode (always present for v230+)
    _game_mode = r.read_int32()

    # Special world flags (version-gated, all present for v230+)
    _drunk = r.read_bool()  # v185+
    _good = r.read_bool()  # v185+
    _tenth = r.read_bool()  # v215+
    _dont_starve = r.read_bool()  # v229+

    if version >= 238:
        _not_the_bees = r.read_bool()
    if version >= 250:
        _remix = r.read_bool()
    if version >= 261:
        _no_traps = r.read_bool()
    if version >= 274:
        _zenith = r.read_bool()

    # v141+ creation time (always present for v230+)
    _creation_time = r.read_int64()

    _moon_type = r.read_byte()
    _dungeon_x = r.read_int32()
    _dungeon_y = r.read_int32()
    _is_evil_world = r.read_bool()

    # Boss kill flags (all present since v66+, v134+ for slime king)
    _downed_boss1 = r.read_bool()
    _downed_boss2 = r.read_bool()
    _downed_boss3 = r.read_bool()
    _downed_queen_bee = r.read_bool()
    _downed_mech1 = r.read_bool()
    _downed_mech2 = r.read_bool()
    _downed_mech3 = r.read_bool()
    _downed_mech_any = r.read_bool()
    _downed_plant = r.read_bool()
    _downed_golem = r.read_bool()
    _downed_slime_king = r.read_bool()

    # NPC saved flags
    _saved_goblin = r.read_bool()
    _saved_wizard = r.read_bool()
    _saved_mechanic = r.read_bool()

    _smashed_orb = r.read_bool()
    _meteor_landed = r.read_bool()
    _shadow_orb_count = r.read_byte()
    _altars_smashed = r.read_int32()

    hardmode = r.read_bool()

    size = _classify_size(max_tiles_x)
    return WorldMetadata(
        name=name,
        width=max_tiles_x,
        height=max_tiles_y,
        version=version,
        seed=seed,
        size=size,  # type: ignore[arg-type]
        hardmode=hardmode,
    )


# ── section 1: tiles ─────────────────────────────────────────────────────────

_AIR_TILE = Tile(tile_id=None, wall_id=None, liquid=0, flags=0)


def _read_tiles(r: Reader, width: int, height: int, tfi: list[bool]) -> TileGrid:
    columns: list[list[Tile]] = []
    for _x in range(width):
        col: list[Tile] = []
        y = 0
        while y < height:
            flags1 = r.read_byte()
            flags2 = r.read_byte() if (flags1 & 0x01) else 0
            flags3 = r.read_byte() if (flags2 & 0x01) else 0

            # Block
            tile_id: int | None = None
            frame_x: int | None = None
            frame_y: int | None = None
            if flags1 & 0x02:
                if flags1 & 0x20:
                    tile_id = r.read_uint16()
                else:
                    tile_id = r.read_byte()
                if tile_id < len(tfi) and tfi[tile_id]:
                    frame_x = r.read_int16()
                    frame_y = r.read_int16()
                    # Terraria forces frameY=0 for tile 144 (Timers).
                    if tile_id == 144:
                        frame_y = 0
                if flags3 & 0x08:
                    _tile_color = r.read_byte()

            # Wall
            wall_id: int | None = None
            if flags1 & 0x04:
                wall_id = r.read_byte()
                if flags3 & 0x04:  # wall high byte (v235+)
                    wall_id |= r.read_byte() << 8
                if flags3 & 0x10:
                    _wall_color = r.read_byte()

            # Liquid
            liquid_type = (flags1 >> 3) & 0x03
            liquid_amount = 0
            if liquid_type:
                liquid_amount = r.read_byte()

            tile = Tile(
                tile_id=tile_id,
                wall_id=wall_id,
                liquid=liquid_amount,
                flags=flags2 | (flags3 << 8),
                frame_x=frame_x,
                frame_y=frame_y,
            )

            # RLE
            rle_type = (flags1 >> 6) & 0x03
            if rle_type == 1:
                rle = r.read_byte()
            elif rle_type == 2:
                rle = r.read_int16()
            else:
                rle = 0

            col.append(tile)
            for _ in range(rle):
                y += 1
                if y >= height:
                    break
                col.append(tile)
            y += 1

        columns.append(col)
    return TileGrid(columns)


# ── section 2: chests ────────────────────────────────────────────────────────


def _read_chests(r: Reader) -> tuple[Chest, ...]:
    chest_count = r.read_int16()
    chest_size = r.read_int16()

    chests: list[Chest] = []
    for chest_id in range(chest_count):
        x = r.read_int32()
        y = r.read_int32()
        name = r.read_net_string()

        items: list[ChestItem] = []
        for _ in range(chest_size):
            stack = r.read_int16()
            if stack > 0:
                item_id = r.read_int32()
                prefix = r.read_byte()
                items.append(ChestItem(item_id=item_id, stack=stack, prefix=prefix))
            else:
                items.append(ChestItem(item_id=0, stack=0, prefix=0))

        # Pad or trim to exactly 40 slots
        while len(items) < _CHEST_CAPACITY:
            items.append(ChestItem(item_id=0, stack=0, prefix=0))

        chests.append(
            Chest(
                chest_id=chest_id,
                x=x,
                y=y,
                name=name,
                items=tuple(items[:_CHEST_CAPACITY]),
            )
        )
    return tuple(chests)


# ── section 3: signs ─────────────────────────────────────────────────────────


def _read_signs(r: Reader) -> tuple[Sign, ...]:
    sign_count = r.read_int16()
    signs: list[Sign] = []
    for _ in range(sign_count):
        text = r.read_net_string()
        x = r.read_int32()
        y = r.read_int32()
        signs.append(Sign(x=x, y=y, text=text))
    return tuple(signs)


# ── public entry points ───────────────────────────────────────────────────────


def parse_wld(stream: BinaryIO) -> World:
    r = Reader(stream)
    try:
        version, offsets, tfi = _read_file_header(r)
        r.seek(offsets[0])
        metadata = _read_world_info(r, version)
        r.seek(offsets[1])
        tiles = _read_tiles(r, metadata.width, metadata.height, tfi)
        r.seek(offsets[2])
        chests = _read_chests(r)
        r.seek(offsets[3])
        signs = _read_signs(r)
    except (WldParseError, UnsupportedWorldVersionError):
        raise
    except Exception as exc:
        raise WldParseError(f"Failed to parse .wld: {exc}", code="corrupt") from exc

    return World(metadata=metadata, tiles=tiles, chests=chests, signs=signs)
