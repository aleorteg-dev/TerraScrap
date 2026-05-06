"""Synthetic .wld fixture builder for unit tests.

Produces valid minimal Terraria world files without using real worlds.
All coordinates / IDs are arbitrary; the file is structurally correct
for the parser's v230-v279 implementation.
"""

from __future__ import annotations

import struct
from collections.abc import Sequence
from dataclasses import dataclass, field

# ── .NET string helper ────────────────────────────────────────────────────────


def _net_string(s: str) -> bytes:
    payload = s.encode("utf-8")
    length = len(payload)
    parts: list[int] = []
    while True:
        b = length & 0x7F
        length >>= 7
        if length:
            b |= 0x80
        parts.append(b)
        if not length:
            break
    return bytes(parts) + payload


# ── tile encoding ─────────────────────────────────────────────────────────────


def _encode_air_column(height: int) -> bytes:
    """Encode a full column of air tiles using RLE."""
    rle = height - 1
    if rle == 0:
        return bytes([0x00])  # single air tile, no RLE
    if rle <= 255:
        return bytes([0x40, rle])  # uint8 RLE
    lo = rle & 0xFF
    hi = (rle >> 8) & 0xFF
    return bytes([0x80, lo, hi])  # int16 RLE


_LIQUID_BITS: dict[str, int] = {
    "none": 0,
    "water": 1,
    "shimmer": 1,  # same bits as water; shimmer flag lives in flags3 bit 7
    "lava": 2,
    "honey": 3,
}


def _encode_block_tile(
    tile_id: int,
    wall_id: int | None = None,
    *,
    frame: tuple[int, int] | None = None,
    flags4: int | None = None,
) -> bytes:
    """Encode a single active tile (no RLE).

    If ``frame`` is provided, two int16 little-endian values (U, V) are
    appended after the tile_id, matching the layout the parser expects when
    ``tfi[tile_id]`` is true.
    """
    flags1 = 0x02  # isActive
    flags3 = 0
    if wall_id is not None:
        flags1 |= 0x04
        if wall_id > 255:
            flags3 |= 0x40
    if flags4 is not None:
        flags3 |= 0x01
    if tile_id > 255:
        flags1 |= 0x20
    if flags3:
        flags1 |= 0x01  # has flags2
        out = bytes([flags1, 0x01, flags3])  # flags2 bit 0 = has flags3
        if flags4 is not None:
            out += bytes([flags4])
    else:
        out = bytes([flags1])
    out += struct.pack("<H", tile_id) if tile_id > 255 else bytes([tile_id])
    if frame is not None:
        out += struct.pack("<hh", frame[0], frame[1])
    if wall_id is not None:
        out += bytes([wall_id & 0xFF])
        if wall_id > 255:
            out += bytes([(wall_id >> 8) & 0xFF])
    return out


def _encode_wall_tile(wall_id: int, *, flags4: int | None = None) -> bytes:
    """Encode a single wall-only tile (no RLE)."""
    flags1 = 0x04
    flags3 = 0x40 if wall_id > 255 else 0
    if flags4 is not None:
        flags3 |= 0x01
    if flags3:
        flags1 |= 0x01
        out = bytes([flags1, 0x01, flags3])
        if flags4 is not None:
            out += bytes([flags4])
    else:
        out = bytes([flags1])
    out += bytes([wall_id & 0xFF])
    if wall_id > 255:
        out += bytes([(wall_id >> 8) & 0xFF])
    return out


def _encode_flags4_air_tile(flags4: int) -> bytes:
    """Encode an air tile that carries the fourth flags byte."""
    return bytes([0x01, 0x01, 0x01, flags4])


def _encode_liquid_tile(liquid_type: str, amount: int) -> bytes:
    """Encode an air tile that contains liquid (no active block, no wall).

    Layout: [flags1] [flags2?] [flags3?] [amount_byte]

    Shimmer needs flags3 bit 7 set, which requires flags2 bit 0 and flags1 bit 0.
    Water/lava/honey only need flags1 bits 3-4.
    """
    lbits = _LIQUID_BITS.get(liquid_type, 0)
    if lbits == 0:
        return bytes([0x00])  # plain air

    flags1 = lbits << 3  # bits 3-4

    if liquid_type == "shimmer":
        # Need flags2 + flags3 to carry the shimmer flag (bit 7 of flags3).
        # flags1 bit 0 = has_flags2; flags2 bit 0 = has_flags3.
        flags1 |= 0x01  # has_flags2
        flags2 = 0x01  # has_flags3
        flags3 = 0x80  # shimmer bit
        return bytes([flags1, flags2, flags3, amount])
    else:
        return bytes([flags1, amount])


# ── chest / sign specs ────────────────────────────────────────────────────────


@dataclass
class ChestSpec:
    x: int
    y: int
    name: str = ""
    items: Sequence[tuple[int, int, int]] = field(default_factory=list)
    # items: list of (item_id, stack, prefix)


@dataclass
class SignSpec:
    x: int
    y: int
    text: str = ""


@dataclass
class NpcSpec:
    id: int
    name: str
    position_x: float
    position_y: float
    is_homeless: bool
    home_x: int
    home_y: int
    is_town_npc: bool = True


# ── section builders ──────────────────────────────────────────────────────────


def _build_section0(
    *,
    version: int,
    name: str,
    seed: str,
    width: int,
    height: int,
    hardmode: bool,
    skyblock_world: bool,
    spawn_x: int,
    spawn_y: int,
    world_surface_y: float,
    rock_layer_y: float,
) -> bytes:
    buf = bytearray()
    buf += _net_string(name)
    buf += _net_string(seed)
    buf += struct.pack("<Q", 0)  # worldGenVersion
    buf += b"\x00" * 16  # GUID
    buf += struct.pack("<i", 1)  # worldId
    buf += struct.pack("<i", 0)  # leftWorld
    buf += struct.pack("<i", width * 16)  # rightWorld
    buf += struct.pack("<i", 0)  # topWorld
    buf += struct.pack("<i", height * 16)  # bottomWorld
    buf += struct.pack("<i", height)  # maxTilesY
    buf += struct.pack("<i", width)  # maxTilesX
    buf += struct.pack("<i", 0)  # gameMode (v209+)
    if version >= 222:
        buf += b"\x00"  # drunkWorld
    if version >= 227:
        buf += b"\x00"  # getGoodWorld
    if version >= 238:
        buf += b"\x00"  # tenthAnnivWorld
    if version >= 239:
        buf += b"\x00"  # dontStarveWorld
    if version >= 241:
        buf += b"\x00"  # notTheBeesWorld
    if version >= 249:
        buf += b"\x00"  # remixWorld
    if version >= 266:
        buf += b"\x00"  # noTrapsWorld
    if version >= 267:
        buf += b"\x00"  # zenithWorld
    if version >= 302:
        buf += b"\x01" if skyblock_world else b"\x00"
    buf += struct.pack("<q", 0)  # creationTime (v141+)
    buf += b"\x00"  # moonType
    # Background style arrays (WorldLoader.js layout):
    # treeTypeXCoordinates[3] + treeStyles[4] + caveBackXCoordinates[3]
    # + caveBackStyles[4] + iceBackStyle + jungleBackStyle + hellBackStyle
    buf += struct.pack("<17i", *([0] * 17))
    # Spawn point and world layers
    buf += struct.pack("<i", spawn_x)  # spawnTileX
    buf += struct.pack("<i", spawn_y)  # spawnTileY
    buf += struct.pack("<d", world_surface_y)  # worldSurfaceY (float64)
    buf += struct.pack("<d", rock_layer_y)  # rockLayerY (float64)
    # Skip fields from gameTime to eclipse
    buf += struct.pack("<d", 0.0)  # gameTime
    buf += b"\x01"  # isDay
    buf += struct.pack("<i", 0)  # moonPhase
    buf += b"\x00"  # bloodMoon
    buf += b"\x00"  # eclipse
    buf += struct.pack("<i", 0)  # dungeonX
    buf += struct.pack("<i", 0)  # dungeonY
    # 21 bools: crimsonWorld + 11 killed-boss + 3 saved-NPC
    # + defeatedGoblinInvasion + killedClown + defeatedFrostLegion
    # + defeatedPirates + brokeAShadowOrb + meteorSpawned
    buf += b"\x00" * 21
    buf += b"\x00"  # shadowOrbsbrokenmod3
    buf += struct.pack("<i", 0)  # altarsSmashed
    buf += b"\x01" if hardmode else b"\x00"  # hardMode
    return bytes(buf)


def _build_section4(*, version: int, npcs: Sequence[NpcSpec] | None) -> bytes:
    specs = list(npcs) if npcs else []
    town_npcs = [npc for npc in specs if npc.is_town_npc]
    transient_npcs = [npc for npc in specs if not npc.is_town_npc]

    buf = bytearray()
    if version >= 268:
        buf += struct.pack("<i", 0)  # NPC kill-count entries

    for npc in town_npcs:
        buf += b"\x01"
        buf += struct.pack("<i", npc.id)
        buf += _net_string(npc.name)
        buf += struct.pack("<f", npc.position_x * 16.0)
        buf += struct.pack("<f", npc.position_y * 16.0)
        buf += b"\x01" if npc.is_homeless else b"\x00"
        buf += struct.pack("<i", npc.home_x)
        buf += struct.pack("<i", npc.home_y)
        if version >= 213:
            buf += b"\x00"  # no town variation payload
        buf += b"\x00"  # homelessDespawn
    buf += b"\x00"

    for npc in transient_npcs:
        buf += b"\x01"
        buf += struct.pack("<i", npc.id)
        buf += struct.pack("<f", npc.position_x * 16.0)
        buf += struct.pack("<f", npc.position_y * 16.0)
    buf += b"\x00"

    return bytes(buf)


def _build_section1(
    *,
    width: int,
    height: int,
    tile_id_at: dict[tuple[int, int], int] | None = None,
    tile_frame_at: dict[tuple[int, int], tuple[int, int]] | None = None,
    frame_important_ids: set[int] | None = None,
    wall_id_at: dict[tuple[int, int], int] | None = None,
    liquid_at: dict[tuple[int, int], tuple[str, int]] | None = None,
    flags4_at: dict[tuple[int, int], int] | None = None,
) -> bytes:
    overrides = tile_id_at or {}
    frames = tile_frame_at or {}
    tfi = frame_important_ids or set()
    walls = wall_id_at or {}
    liquids = liquid_at or {}
    flags4s = flags4_at or {}
    # All positions that are non-air (block override or liquid)
    special: set[tuple[int, int]] = (
        set(overrides) | set(walls) | set(liquids) | set(flags4s)
    )
    buf = bytearray()
    for x in range(width):
        y = 0
        while y < height:
            pos = (x, y)
            if pos in overrides:
                tile_id = overrides[pos]
                frame = frames.get(pos) if tile_id in tfi else None
                buf += _encode_block_tile(
                    tile_id,
                    wall_id=walls.get(pos),
                    frame=frame,
                    flags4=flags4s.get(pos),
                )
                y += 1
            elif pos in walls:
                buf += _encode_wall_tile(walls[pos], flags4=flags4s.get(pos))
                y += 1
            elif pos in liquids:
                ltype, lamount = liquids[pos]
                buf += _encode_liquid_tile(ltype, lamount)
                y += 1
            elif pos in flags4s:
                buf += _encode_flags4_air_tile(flags4s[pos])
                y += 1
            else:
                # Find run of consecutive plain-air in this column
                run_end = y + 1
                while run_end < height and (x, run_end) not in special:
                    run_end += 1
                run_len = run_end - y
                buf += _encode_air_column(run_len)
                y = run_end
    return bytes(buf)


def _build_section2(*, version: int, chests: Sequence[ChestSpec] | None) -> bytes:
    specs = list(chests) if chests else []
    buf = bytearray()
    buf += struct.pack("<h", len(specs))  # chestCount
    if version < 280:
        buf += struct.pack("<h", 40)  # chestSize
    for cs in specs:
        buf += struct.pack("<i", cs.x)
        buf += struct.pack("<i", cs.y)
        buf += _net_string(cs.name)
        if version >= 280:
            buf += struct.pack("<i", 40)  # per-chest item slot count
        items = list(cs.items)
        for i in range(40):
            if i < len(items):
                item_id, stack, prefix = items[i]
                buf += struct.pack("<h", stack)
                if stack > 0:
                    buf += struct.pack("<i", item_id)
                    buf += bytes([prefix])
            else:
                buf += struct.pack("<h", 0)
    return bytes(buf)


def _build_section3(signs: Sequence[SignSpec] | None) -> bytes:
    specs = list(signs) if signs else []
    buf = bytearray()
    buf += struct.pack("<h", len(specs))
    for ss in specs:
        buf += _net_string(ss.text)
        buf += struct.pack("<i", ss.x)
        buf += struct.pack("<i", ss.y)
    return bytes(buf)


# ── main builder ──────────────────────────────────────────────────────────────

_NUM_TILE_TYPES = 623  # cover all Terraria 1.4.x tile IDs


def _encode_tfi(num_tile_types: int, frame_important_ids: set[int] | None) -> bytes:
    ids = frame_important_ids or set()
    num_bytes = (num_tile_types + 7) // 8
    out = bytearray(num_bytes)
    for tid in ids:
        if 0 <= tid < num_tile_types:
            out[tid // 8] |= 1 << (tid % 8)
    return bytes(out)


@dataclass
class WldBuilder:
    name: str = "TestWorld"
    version: int = 269
    width: int = 8
    height: int = 4
    seed: str = "1234567890.1.1"
    hardmode: bool = False
    npcs: list[NpcSpec] = field(default_factory=list)

    def add_npc(
        self,
        *,
        id: int,
        name: str,
        position_x: float,
        position_y: float,
        is_homeless: bool,
        home_x: int,
        home_y: int,
        is_town_npc: bool = True,
    ) -> WldBuilder:
        self.npcs.append(
            NpcSpec(
                id=id,
                name=name,
                position_x=position_x,
                position_y=position_y,
                is_homeless=is_homeless,
                home_x=home_x,
                home_y=home_y,
                is_town_npc=is_town_npc,
            )
        )
        return self

    def build(self) -> bytes:
        return build_world(
            name=self.name,
            version=self.version,
            width=self.width,
            height=self.height,
            seed=self.seed,
            hardmode=self.hardmode,
            npcs=self.npcs,
        )


def build_world(
    *,
    name: str = "TestWorld",
    version: int = 269,
    width: int = 8,
    height: int = 4,
    seed: str = "1234567890.1.1",
    hardmode: bool = False,
    skyblock_world: bool = False,
    spawn_x: int = 100,
    spawn_y: int = 50,
    world_surface_y: float = 200.0,
    rock_layer_y: float = 500.0,
    chests: Sequence[ChestSpec] | None = None,
    signs: Sequence[SignSpec] | None = None,
    npcs: Sequence[NpcSpec] | None = None,
    tile_id_at: dict[tuple[int, int], int] | None = None,
    tile_frame_at: dict[tuple[int, int], tuple[int, int]] | None = None,
    frame_important_ids: set[int] | None = None,
    wall_id_at: dict[tuple[int, int], int] | None = None,
    liquid_at: dict[tuple[int, int], tuple[str, int]] | None = None,
    flags4_at: dict[tuple[int, int], int] | None = None,
) -> bytes:
    """Return bytes of a valid synthetic .wld file."""
    s0 = _build_section0(
        version=version,
        name=name,
        seed=seed,
        width=width,
        height=height,
        hardmode=hardmode,
        skyblock_world=skyblock_world,
        spawn_x=spawn_x,
        spawn_y=spawn_y,
        world_surface_y=world_surface_y,
        rock_layer_y=rock_layer_y,
    )
    s1 = _build_section1(
        width=width,
        height=height,
        tile_id_at=tile_id_at,
        tile_frame_at=tile_frame_at,
        frame_important_ids=frame_important_ids,
        wall_id_at=wall_id_at,
        liquid_at=liquid_at,
        flags4_at=flags4_at,
    )
    s2 = _build_section2(version=version, chests=chests)
    s3 = _build_section3(signs)
    s4 = _build_section4(version=version, npcs=npcs)

    # Build header (everything before section data)
    magic = b"relogic"
    file_type = bytes([2])  # world
    revision = struct.pack("<I", 0)
    favorites = struct.pack("<Q", 0)
    num_sections = struct.pack("<h", 5)
    num_tile_types = struct.pack("<h", _NUM_TILE_TYPES)
    tfi_bytes = _encode_tfi(_NUM_TILE_TYPES, frame_important_ids)

    header_size = (
        4  # version int32
        + 7  # magic
        + 1  # file type
        + 4  # revision
        + 8  # favorites
        + 2  # num_sections
        + 4 * 5  # 5 section offsets (int32 each)
        + 2  # num_tile_types
        + len(tfi_bytes)  # tfi bitfield
    )

    off0 = header_size
    off1 = off0 + len(s0)
    off2 = off1 + len(s1)
    off3 = off2 + len(s2)
    off4 = off3 + len(s3)

    offsets = struct.pack("<5i", off0, off1, off2, off3, off4)

    header = (
        struct.pack("<i", version)
        + magic
        + file_type
        + revision
        + favorites
        + num_sections
        + offsets
        + num_tile_types
        + tfi_bytes
    )

    assert len(header) == header_size, f"{len(header)} != {header_size}"
    return header + s0 + s1 + s2 + s3 + s4
