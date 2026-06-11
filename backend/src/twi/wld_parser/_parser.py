"""Core parsing logic for .wld files (Terraria v230-v319)."""

from __future__ import annotations

import logging
import math
from typing import BinaryIO, Literal

from twi.wld_parser._exceptions import UnsupportedWorldVersionError, WldParseError
from twi.wld_parser._reader import Reader
from twi.wld_parser._types import (
    BackgroundStyles,
    Chest,
    ChestItem,
    Npc,
    Sign,
    Tile,
    TileEntity,
    TileGrid,
    World,
    WorldMetadata,
)

_LOG = logging.getLogger(__name__)

_MAGIC = b"relogic"
_FILE_TYPE_WORLD: int = 2
_MIN_VERSION: int = 230
_MAX_VERSION: int = 319
_MODERN_CHEST_VERSION: int = 280
_CHEST_CAPACITY: int = 40
_NPC_KILL_COUNT_VERSION: int = 268
_NPC_TOWN_VARIATION_VERSION: int = 213
_NPC_HOMELESS_DESPAWN_VERSION: int = 280


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
        raise UnsupportedWorldVersionError(
            version, supported_range=(_MIN_VERSION, _MAX_VERSION)
        )

    _revision = r.read_uint32()
    _favorites = r.read_uint64()

    num_sections = r.read_int16()
    if num_sections < 5:
        raise WldParseError(
            f"Too few sections: {num_sections} (need at least 5).",
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


def _read_world_info(r: Reader, version: int) -> tuple[WorldMetadata, int]:
    """Return (WorldMetadata, world_id). world_id is used for footer validation."""
    name = r.read_net_string()
    seed = r.read_net_string()
    _world_gen_version = r.read_uint64()
    _guid = r.read_bytes(16)
    world_id = r.read_int32()

    # Bounds (pixels = tiles * 16)
    _left = r.read_int32()
    _right = r.read_int32()
    _top = r.read_int32()
    _bottom = r.read_int32()

    max_tiles_y = r.read_int32()  # height
    max_tiles_x = r.read_int32()  # width

    # v209+ game mode (always present for v230+)
    _game_mode = r.read_int32()

    # Special world flags, version gates mirrored from WorldLoader.js.
    if version >= 222:
        _drunk = r.read_bool()
    if version >= 227:
        _good = r.read_bool()
    if version >= 238:
        _tenth = r.read_bool()
    if version >= 239:
        _dont_starve = r.read_bool()
    if version >= 241:
        _not_the_bees = r.read_bool()
    if version >= 249:
        _remix = r.read_bool()
    if version >= 266:
        _no_traps = r.read_bool()
    if version >= 267:
        _zenith = r.read_bool()
    if version >= 302:
        _skyblock = r.read_bool()

    # v141+ creation time (always present for v230+)
    _creation_time = r.read_int64()
    # v284+ adds lastPlayed:int64 between creationTime and moonType
    if version >= 284:
        r.read_int64()

    moon_style = r.read_byte()

    # Background style arrays (WorldLoader.js layout: 3+4+3+4+1+1+1 int32s).
    # These sit between moonType and the spawn/layer fields in the binary.
    try:
        tree_x = (r.read_int32(), r.read_int32(), r.read_int32())
        tree_style = (r.read_int32(), r.read_int32(), r.read_int32(), r.read_int32())
        cave_back_x = (r.read_int32(), r.read_int32(), r.read_int32())
        cave_back_style = (
            r.read_int32(),
            r.read_int32(),
            r.read_int32(),
            r.read_int32(),
        )
        ice_back_style = r.read_int32()
        jungle_back_style = r.read_int32()
        hell_back_style = r.read_int32()

        spawn_x = r.read_int32()
        spawn_y = r.read_int32()
        world_surface_y = r.read_double()
        rock_layer_y = r.read_double()
    except WldParseError as _exc:
        raise WldParseError(
            "World info section truncated before spawn/layer fields.",
            code="invalid_world_info",
        ) from _exc

    # Skip remaining fields up to hardMode (WorldLoader.js order).
    r.read_double()  # gameTime
    r.read_bool()  # isDay
    r.read_int32()  # moonPhase
    r.read_bool()  # bloodMoon
    r.read_bool()  # eclipse
    r.read_int32()  # dungeonX
    r.read_int32()  # dungeonY

    # 21 single-byte bools: crimsonWorld + 11 killed-boss + 3 saved-NPC
    # + defeatedGoblinInvasion + killedClown + defeatedFrostLegion
    # + defeatedPirates + brokeAShadowOrb + meteorSpawned
    for _ in range(21):
        r.read_bool()
    r.read_byte()  # shadowOrbsbrokenmod3
    r.read_int32()  # altarsSmashed

    hardmode = r.read_bool()

    # Compute hell layer from surface and height (TerraMap formula).
    _hell_level = ((max_tiles_y - 230) - world_surface_y) / 6.0
    hell_layer_y = _hell_level * 6.0 + world_surface_y - 5.0

    size = _classify_size(max_tiles_x)
    background_styles = BackgroundStyles(
        moon_style=moon_style,
        tree_x=tree_x,
        tree_style=tree_style,
        cave_back_x=cave_back_x,
        cave_back_style=cave_back_style,
        ice_back_style=ice_back_style,
        jungle_back_style=jungle_back_style,
        hell_back_style=hell_back_style,
    )
    return WorldMetadata(
        name=name,
        width=max_tiles_x,
        height=max_tiles_y,
        version=version,
        seed=seed,
        size=size,  # type: ignore[arg-type]
        hardmode=hardmode,
        spawn_x=spawn_x,
        spawn_y=spawn_y,
        world_surface_y=world_surface_y,
        rock_layer_y=rock_layer_y,
        hell_layer_y=hell_layer_y,
        background_styles=background_styles,
    ), world_id


# ── section 1: tiles ─────────────────────────────────────────────────────────

_AIR_TILE = Tile(
    tile_id=None, wall_id=None, liquid_type="none", liquid_amount=0, flags=0
)


def _read_tiles(r: Reader, width: int, height: int, tfi: list[bool]) -> TileGrid:
    columns: list[list[Tile]] = []
    for _x in range(width):
        col: list[Tile] = []
        y = 0
        while y < height:
            flags1 = r.read_byte()
            flags2 = r.read_byte() if (flags1 & 0x01) else 0
            flags3 = r.read_byte() if (flags2 & 0x01) else 0
            flags4 = r.read_byte() if (flags3 & 0x01) else 0

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
                if flags3 & 0x10:
                    _wall_color = r.read_byte()

            # Liquid
            liquid_bits = (flags1 >> 3) & 0x03
            liquid_amount = 0
            liquid_type: Literal["none", "water", "lava", "honey", "shimmer"] = "none"
            if liquid_bits:
                liquid_amount = r.read_byte()
                if liquid_bits == 1:
                    liquid_type = "shimmer" if (flags3 & 0x80) else "water"
                elif liquid_bits == 2:
                    liquid_type = "lava"
                else:
                    liquid_type = "honey"

            if flags3 & 0x40:
                wall_high = r.read_byte()
                if wall_id is not None:
                    wall_id |= wall_high << 8

            tile = Tile(
                tile_id=tile_id,
                wall_id=wall_id,
                liquid_type=liquid_type,
                liquid_amount=liquid_amount,
                flags=flags2 | (flags3 << 8) | (flags4 << 16),
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


def _read_chest_item(r: Reader, stack: int) -> ChestItem:
    if stack > 0:
        item_id = r.read_int32()
        prefix = r.read_byte()
        return ChestItem(item_id=item_id, stack=stack, prefix=prefix)
    if stack < 0:
        item_id = r.read_int32()
        prefix = r.read_byte()
        return ChestItem(item_id=item_id, stack=1, prefix=prefix)
    return ChestItem(item_id=0, stack=0, prefix=0)


def _skip_chest_item_payload(r: Reader, stack: int) -> None:
    if stack > 0:
        _item_id = r.read_int32()
        _prefix = r.read_byte()


def _read_chests(r: Reader, version: int) -> tuple[Chest, ...]:
    chest_count = r.read_int16()
    chest_size = r.read_int16() if version < _MODERN_CHEST_VERSION else None

    chests: list[Chest] = []
    for chest_id in range(chest_count):
        x = r.read_int32()
        y = r.read_int32()
        name = r.read_net_string()
        item_slot_count = r.read_int32() if chest_size is None else chest_size

        items: list[ChestItem] = []
        readable_slots = min(item_slot_count, _CHEST_CAPACITY)
        for _ in range(readable_slots):
            stack = r.read_int16()
            items.append(_read_chest_item(r, stack))

        for _ in range(max(0, item_slot_count - _CHEST_CAPACITY)):
            stack = r.read_int16()
            _skip_chest_item_payload(r, stack)

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


def _validate_npc_coordinates(
    *,
    npc_id: int,
    position_x: float,
    position_y: float,
    is_homeless: bool,
    home_x: int,
    home_y: int,
    is_town_npc: bool,
    width: int,
    height: int,
) -> None:
    position_ok = (
        math.isfinite(position_x)
        and math.isfinite(position_y)
        and 0.0 <= position_x < float(width)
        and 0.0 <= position_y < float(height)
    )
    home_ok = (
        not is_town_npc or is_homeless or (0 <= home_x < width and 0 <= home_y < height)
    )
    if position_ok and home_ok:
        return

    raise WldParseError(
        "NPC coordinates are outside world bounds.",
        code="invalid_npc",
        details={
            "id": npc_id,
            "position_x": position_x,
            "position_y": position_y,
            "home_x": home_x,
            "home_y": home_y,
            "width": width,
            "height": height,
        },
    )


def _read_town_npc(r: Reader, version: int, width: int, height: int) -> Npc:
    npc_id = r.read_int32()
    name = r.read_net_string()
    position_x = r.read_float32() / 16.0
    position_y = r.read_float32() / 16.0
    is_homeless = r.read_bool()
    home_x = r.read_int32()
    home_y = r.read_int32()

    if version >= _NPC_TOWN_VARIATION_VERSION and r.read_bool():
        _town_variation = r.read_int32()
    if version >= _NPC_HOMELESS_DESPAWN_VERSION:
        _homeless_despawn = r.read_bool()

    _validate_npc_coordinates(
        npc_id=npc_id,
        position_x=position_x,
        position_y=position_y,
        is_homeless=is_homeless,
        home_x=home_x,
        home_y=home_y,
        is_town_npc=True,
        width=width,
        height=height,
    )
    return Npc(
        id=npc_id,
        name=name,
        position_x=position_x,
        position_y=position_y,
        is_homeless=is_homeless,
        home_x=home_x,
        home_y=home_y,
        is_town_npc=True,
    )


def _read_transient_npc(r: Reader, width: int, height: int) -> Npc:
    npc_id = r.read_int32()
    position_x = r.read_float32() / 16.0
    position_y = r.read_float32() / 16.0
    home_x = -1
    home_y = -1

    _validate_npc_coordinates(
        npc_id=npc_id,
        position_x=position_x,
        position_y=position_y,
        is_homeless=False,
        home_x=home_x,
        home_y=home_y,
        is_town_npc=False,
        width=width,
        height=height,
    )
    return Npc(
        id=npc_id,
        name="",
        position_x=position_x,
        position_y=position_y,
        is_homeless=False,
        home_x=home_x,
        home_y=home_y,
        is_town_npc=False,
    )


def _read_npcs(r: Reader, version: int, width: int, height: int) -> list[Npc]:
    if version >= _NPC_KILL_COUNT_VERSION:
        kill_count_entries = r.read_int32()
        if kill_count_entries < 0:
            raise WldParseError(
                "NPC kill-count table has a negative size.",
                code="invalid_npc",
                details={"kill_count_entries": kill_count_entries},
            )
        for _ in range(kill_count_entries):
            r.read_int32()

    npcs: list[Npc] = []
    has_npc = r.read_bool()
    while has_npc:
        npcs.append(_read_town_npc(r, version, width, height))
        has_npc = r.read_bool()

    has_transient_npc = r.read_bool()
    while has_transient_npc:
        npcs.append(_read_transient_npc(r, width, height))
        has_transient_npc = r.read_bool()

    return npcs


# ── section 5: tile entities ─────────────────────────────────────────────────

_MAX_TILE_ENTITY_TYPE: int = 10


def _read_mannequin_data(r: Reader) -> dict[str, int | str]:
    arg0 = r.read_byte()
    bb = r.read_byte()
    pose = r.read_byte()
    bits_byte = r.read_byte()
    data: dict[str, int | str] = {"pose": pose}
    num = arg0 | (((bits_byte >> 1) & 1) << 8)
    for i in range(9):
        if (num >> i) & 1:
            data[f"item_{i}_id"] = r.read_int16()
            data[f"item_{i}_prefix"] = r.read_byte()
            data[f"item_{i}_stack"] = r.read_int16()
        else:
            data[f"item_{i}_id"] = 0
            data[f"item_{i}_prefix"] = 0
            data[f"item_{i}_stack"] = 0
    num2 = bb | (((bits_byte >> 2) & 1) << 8)
    for j in range(9):
        if (num2 >> j) & 1:
            data[f"dye_{j}_id"] = r.read_int16()
            data[f"dye_{j}_prefix"] = r.read_byte()
            data[f"dye_{j}_stack"] = r.read_int16()
        else:
            data[f"dye_{j}_id"] = 0
            data[f"dye_{j}_prefix"] = 0
            data[f"dye_{j}_stack"] = 0
    if bits_byte & 1:
        data["misc_0_id"] = r.read_int16()
        data["misc_0_prefix"] = r.read_byte()
        data["misc_0_stack"] = r.read_int16()
    else:
        data["misc_0_id"] = 0
        data["misc_0_prefix"] = 0
        data["misc_0_stack"] = 0
    return data


def _read_hat_rack_data(r: Reader) -> dict[str, int | str]:
    bitmask = r.read_byte()
    data: dict[str, int | str] = {}
    for i in range(2):
        if (bitmask >> i) & 1:
            data[f"item_{i}_id"] = r.read_int16()
            data[f"item_{i}_prefix"] = r.read_byte()
            data[f"item_{i}_stack"] = r.read_int16()
        else:
            data[f"item_{i}_id"] = 0
            data[f"item_{i}_prefix"] = 0
            data[f"item_{i}_stack"] = 0
    for j in range(2):
        if (bitmask >> (j + 2)) & 1:
            data[f"dye_{j}_id"] = r.read_int16()
            data[f"dye_{j}_prefix"] = r.read_byte()
            data[f"dye_{j}_stack"] = r.read_int16()
        else:
            data[f"dye_{j}_id"] = 0
            data[f"dye_{j}_prefix"] = 0
            data[f"dye_{j}_stack"] = 0
    return data


def _read_tile_entity_data(r: Reader, entity_type: int) -> dict[str, int | str] | None:
    """Return type-specific payload dict, or None for unknown type."""
    if entity_type == 0:  # target dummy
        npc_id = r.read_int16()
        return {"npc_id": npc_id}
    if entity_type in (1, 4, 6, 8):  # item frame / weapon rack / plate / dead cells jar
        item_id = r.read_int16()
        prefix_id = r.read_byte()
        stack = r.read_int16()
        return {"item_id": item_id, "prefix_id": prefix_id, "stack": stack}
    if entity_type == 2:  # logic sensor
        logic_check_type = r.read_byte()
        on = r.read_byte()
        return {"logic_check_type": logic_check_type, "on": on}
    if entity_type == 3:  # display doll / mannequin
        return _read_mannequin_data(r)
    if entity_type == 5:  # hat rack
        return _read_hat_rack_data(r)
    if entity_type == 7:  # pylon
        return {}
    if entity_type in (9, 10):  # kite anchor / critter anchor
        item_id = r.read_int16()
        return {"item_id": item_id}
    return None


def _read_tile_entities(r: Reader) -> list[TileEntity]:
    count = r.read_int32()
    entities: list[TileEntity] = []
    for _ in range(count):
        entity_type = r.read_byte()
        entity_id = r.read_int32()
        x = r.read_int16()
        y = r.read_int16()
        data = _read_tile_entity_data(r, entity_type)
        if data is None:
            _LOG.warning(
                "Unknown tile entity type %d at (%d, %d); skipping remaining entities.",
                entity_type,
                x,
                y,
            )
            break
        entities.append(
            TileEntity(id=entity_id, entity_type=entity_type, x=x, y=y, data=data)
        )
    return entities


# ── section 6: footer ────────────────────────────────────────────────────────


def _validate_footer(
    r: Reader, offsets: list[int], world_name: str, world_id: int
) -> None:
    """Validate the .wld footer section.

    Footer layout (Terraria format): bool(flag) + .NET string(name) + int32(id).
    Raises WldParseError(code='invalid_footer') on any mismatch or truncation.
    """
    if len(offsets) < 7:
        raise WldParseError(
            "Footer section (offsets[-1]) is missing.",
            code="invalid_footer",
        )
    r.seek(offsets[-1])
    try:
        flag = r.read_bool()
        name = r.read_net_string()
        wid = r.read_int32()
    except WldParseError as exc:
        raise WldParseError(
            "Footer section is truncated or unreadable.",
            code="invalid_footer",
        ) from exc
    if not flag or name != world_name or wid != world_id:
        raise WldParseError(
            f"Footer validation failed: flag={flag}, name={name!r}, id={wid}.",
            code="invalid_footer",
        )


# ── public entry points ───────────────────────────────────────────────────────


def parse_wld(stream: BinaryIO) -> World:
    r = Reader(stream)
    try:
        version, offsets, tfi = _read_file_header(r)
        r.seek(offsets[0])
        metadata, world_id = _read_world_info(r, version)
        r.seek(offsets[1])
        tiles = _read_tiles(r, metadata.width, metadata.height, tfi)
        r.seek(offsets[2])
        chests = _read_chests(r, version)
        r.seek(offsets[3])
        signs = _read_signs(r)
        r.seek(offsets[4])
        npcs = _read_npcs(r, version, metadata.width, metadata.height)
        tile_entities: list[TileEntity] = []
        if len(offsets) >= 6:
            r.seek(offsets[5])
            tile_entities = _read_tile_entities(r)
        _validate_footer(r, offsets, metadata.name, world_id)
    except (WldParseError, UnsupportedWorldVersionError):
        raise
    except Exception as exc:
        raise WldParseError(f"Failed to parse .wld: {exc}", code="corrupt") from exc

    return World(
        metadata=metadata,
        tiles=tiles,
        chests=chests,
        signs=signs,
        npcs=npcs,
        tile_entities=tile_entities,
    )
