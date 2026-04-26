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


def _encode_block_tile(tile_id: int, wall_id: int | None = None) -> bytes:
    """Encode a single active tile (no RLE, no frame data)."""
    flags1 = 0x02  # isActive
    if wall_id is not None:
        flags1 |= 0x04
    if tile_id > 255:
        flags1 |= 0x20
    out = bytes([flags1])
    out += struct.pack("<H", tile_id) if tile_id > 255 else bytes([tile_id])
    if wall_id is not None:
        out += bytes([wall_id & 0xFF])
    return out


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


# ── section builders ──────────────────────────────────────────────────────────


def _build_section0(
    *,
    version: int,
    name: str,
    seed: str,
    width: int,
    height: int,
    hardmode: bool,
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
    buf += struct.pack("<i", 0)  # gameMode (v225+)
    buf += b"\x00"  # drunkWorld
    buf += b"\x00"  # goodWorld (v185+)
    buf += b"\x00"  # tenthAnnivWorld (v215+)
    buf += b"\x00"  # dontStarveWorld (v229+)
    if version >= 238:
        buf += b"\x00"  # notTheBeesWorld
    if version >= 250:
        buf += b"\x00"  # remixWorld
    if version >= 261:
        buf += b"\x00"  # noTrapsWorld
    if version >= 274:
        buf += b"\x00"  # zenithWorld
    buf += struct.pack("<q", 0)  # creationTime (v141+)
    buf += b"\x00"  # moonType
    buf += struct.pack("<i", 0)  # dungeonX
    buf += struct.pack("<i", 0)  # dungeonY
    buf += b"\x00"  # isEvilWorld
    buf += b"\x00"  # downedBoss1
    buf += b"\x00"  # downedBoss2
    buf += b"\x00"  # downedBoss3
    buf += b"\x00"  # downedQueenBee
    buf += b"\x00"  # downedMechBoss1
    buf += b"\x00"  # downedMechBoss2
    buf += b"\x00"  # downedMechBoss3
    buf += b"\x00"  # downedMechBossAny
    buf += b"\x00"  # downedPlant
    buf += b"\x00"  # downedGolem
    buf += b"\x00"  # downedSlimeKing
    buf += b"\x00"  # savedGoblin
    buf += b"\x00"  # savedWizard
    buf += b"\x00"  # savedMechanic
    buf += b"\x00"  # smashedOrb
    buf += b"\x00"  # meteorLanded
    buf += b"\x00"  # shadowOrbCount
    buf += struct.pack("<i", 0)  # altarsSmashed
    buf += b"\x01" if hardmode else b"\x00"
    return bytes(buf)


def _build_section1(
    *,
    width: int,
    height: int,
    tile_id_at: dict[tuple[int, int], int] | None = None,
) -> bytes:
    overrides = tile_id_at or {}
    buf = bytearray()
    for x in range(width):
        y = 0
        while y < height:
            pos = (x, y)
            if pos in overrides:
                buf += _encode_block_tile(overrides[pos])
                y += 1
            else:
                # Find run of consecutive air in this column
                run_end = y + 1
                while run_end < height and (x, run_end) not in overrides:
                    run_end += 1
                run_len = run_end - y
                buf += _encode_air_column(run_len)
                y = run_end
    return bytes(buf)


def _build_section2(chests: Sequence[ChestSpec] | None) -> bytes:
    specs = list(chests) if chests else []
    buf = bytearray()
    buf += struct.pack("<h", len(specs))  # chestCount
    buf += struct.pack("<h", 40)  # chestSize
    for cs in specs:
        buf += struct.pack("<i", cs.x)
        buf += struct.pack("<i", cs.y)
        buf += _net_string(cs.name)
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


def build_world(
    *,
    name: str = "TestWorld",
    version: int = 269,
    width: int = 8,
    height: int = 4,
    seed: str = "1234567890.1.1",
    hardmode: bool = False,
    chests: Sequence[ChestSpec] | None = None,
    signs: Sequence[SignSpec] | None = None,
    tile_id_at: dict[tuple[int, int], int] | None = None,
) -> bytes:
    """Return bytes of a valid synthetic .wld file."""
    s0 = _build_section0(
        version=version,
        name=name,
        seed=seed,
        width=width,
        height=height,
        hardmode=hardmode,
    )
    s1 = _build_section1(width=width, height=height, tile_id_at=tile_id_at)
    s2 = _build_section2(chests)
    s3 = _build_section3(signs)

    # Build header (everything before section data)
    magic = b"relogic"
    file_type = bytes([2])  # world
    revision = struct.pack("<I", 0)
    favorites = struct.pack("<Q", 0)
    num_sections = struct.pack("<h", 4)
    num_tile_types = struct.pack("<h", _NUM_TILE_TYPES)
    tfi_bytes = b"\x00" * ((_NUM_TILE_TYPES + 7) // 8)  # all non-frame-important

    header_size = (
        4  # version int32
        + 7  # magic
        + 1  # file type
        + 4  # revision
        + 8  # favorites
        + 2  # num_sections
        + 4 * 4  # 4 section offsets (int32 each)
        + 2  # num_tile_types
        + len(tfi_bytes)  # tfi bitfield
    )

    off0 = header_size
    off1 = off0 + len(s0)
    off2 = off1 + len(s1)
    off3 = off2 + len(s2)

    offsets = struct.pack("<4i", off0, off1, off2, off3)

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
    return header + s0 + s1 + s2 + s3
