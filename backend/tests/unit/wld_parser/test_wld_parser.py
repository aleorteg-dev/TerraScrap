"""Unit tests for B1 – wld-parser (T-01 through T-08)."""

from __future__ import annotations

import time

import pytest

from tests.fixtures.wld_builder import ChestSpec, SignSpec, build_world
from twi.wld_parser import (
    Tile,
    UnsupportedWorldVersionError,
    WldParseError,
    parse_wld_bytes,
)

# ── T-01 ──────────────────────────────────────────────────────────────────────


def test_parse_empty_minimal_world_returns_expected_metadata() -> None:
    data = build_world(
        name="MyWorld",
        version=269,
        width=4200,
        height=1200,
        seed="abc",
        hardmode=False,
    )
    world = parse_wld_bytes(data)
    assert world.metadata.name == "MyWorld"
    assert world.metadata.width == 4200
    assert world.metadata.height == 1200
    assert world.metadata.seed == "abc"
    assert world.metadata.hardmode is False
    assert world.metadata.size == "small"
    assert world.metadata.version == 269


# ── T-02 ──────────────────────────────────────────────────────────────────────


def test_parse_reads_tiles_as_grid_with_expected_dimensions() -> None:
    data = build_world(width=8, height=4)
    world = parse_wld_bytes(data)
    assert world.tiles.width == 8
    assert world.tiles.height == 4
    tile = world.tiles[0][0]
    assert isinstance(tile, Tile)


# ── T-03 ──────────────────────────────────────────────────────────────────────


def test_parse_air_tile_has_none_tile_id() -> None:
    data = build_world(width=4, height=4)
    world = parse_wld_bytes(data)
    for x in range(4):
        for y in range(4):
            assert world.tiles[x][y].tile_id is None


# ── T-04 ──────────────────────────────────────────────────────────────────────


def test_parse_chest_items_returns_40_slots_with_empty_slots_zeroed() -> None:
    specs = [ChestSpec(x=1, y=1, name="Treasure", items=[(3930, 1, 0)])]
    data = build_world(width=8, height=8, chests=specs)
    world = parse_wld_bytes(data)

    assert len(world.chests) == 1
    chest = world.chests[0]
    assert chest.x == 1
    assert chest.y == 1
    assert chest.name == "Treasure"
    assert len(chest.items) == 40

    first = chest.items[0]
    assert first.item_id == 3930
    assert first.stack == 1
    assert first.prefix == 0

    for item in chest.items[1:]:
        assert item.item_id == 0
        assert item.stack == 0
        assert item.prefix == 0


# ── T-05 ──────────────────────────────────────────────────────────────────────


def test_parse_rejects_invalid_header_with_wld_parse_error() -> None:
    with pytest.raises(WldParseError):
        parse_wld_bytes(b"not a valid wld file at all!!!!!!")


def test_parse_rejects_truncated_file_with_wld_parse_error() -> None:
    with pytest.raises(WldParseError):
        parse_wld_bytes(b"\xd9\x00\x00\x00")  # version only, truncated


# ── T-06 ──────────────────────────────────────────────────────────────────────


def test_parse_rejects_unsupported_version_below_range() -> None:
    data = build_world(version=100)
    with pytest.raises(UnsupportedWorldVersionError) as exc_info:
        parse_wld_bytes(data)
    assert exc_info.value.version == 100
    assert isinstance(exc_info.value, WldParseError)


def test_parse_rejects_unsupported_version_above_range() -> None:
    data = build_world(version=320)
    with pytest.raises(UnsupportedWorldVersionError) as exc_info:
        parse_wld_bytes(data)
    assert exc_info.value.version == 320


def test_parse_above_ceiling_raises_unsupported_version() -> None:
    data = build_world(version=320)
    with pytest.raises(UnsupportedWorldVersionError) as exc_info:
        parse_wld_bytes(data)

    exc = exc_info.value
    assert exc.code == "unsupported_version"
    assert exc.version == 320
    assert exc.detected_version == 320
    assert exc.supported_range == (230, 319)
    assert exc.details == {
        "detected_version": 320,
        "supported_range": (230, 319),
    }
    message = str(exc)
    assert "320" in message
    assert "230-319" in message
    assert "not supported" in message.lower()


def test_parse_v319_real_world_ok() -> None:
    data = build_world(
        name="V319Synthetic",
        version=319,
        width=4200,
        height=1200,
        seed="2105673604",
        hardmode=True,
        skyblock_world=True,
        chests=[ChestSpec(x=10, y=20, name="ModernChest", items=[(3930, 1, 0)])],
        wall_id_at={(1, 1): 300},
        flags4_at={(2, 2): 0x7F},
    )

    world = parse_wld_bytes(data)

    assert world.metadata.name == "V319Synthetic"
    assert world.metadata.version == 319
    assert world.metadata.width == 4200
    assert world.metadata.height == 1200
    assert world.metadata.seed == "2105673604"
    assert world.metadata.hardmode is True
    assert world.tiles.width == 4200
    assert world.tiles.height == 1200
    assert world.tiles[1][1].wall_id == 300
    assert world.tiles[2][2].tile_id is None
    assert len(world.chests) == 1
    assert world.chests[0].name == "ModernChest"
    assert world.chests[0].items[0].item_id == 3930


def test_parse_v230_still_ok() -> None:
    data = build_world(version=230, width=8, height=4, hardmode=True)
    world = parse_wld_bytes(data)
    assert world.metadata.version == 230
    assert world.metadata.width == 8
    assert world.metadata.height == 4
    assert world.metadata.hardmode is True


def test_parse_v279_still_ok() -> None:
    data = build_world(version=279, width=8, height=4, hardmode=True)
    world = parse_wld_bytes(data)
    assert world.metadata.version == 279
    assert world.metadata.width == 8
    assert world.metadata.height == 4
    assert world.metadata.hardmode is True


def test_parse_v302_skyblock_world_flag_alignment_ok() -> None:
    data = build_world(version=302, width=8, height=4, hardmode=True)
    world = parse_wld_bytes(data)
    assert world.metadata.version == 302
    assert world.metadata.hardmode is True


@pytest.mark.parametrize("version", [287, 288, 291, 296, 297, 300, 310, 313])
def test_parse_documented_intermediate_version_tramos_ok(version: int) -> None:
    data = build_world(version=version, width=8, height=4)
    world = parse_wld_bytes(data)
    assert world.metadata.version == version


def test_parse_v304_dual_dungeons_tramo_ok() -> None:
    data = build_world(version=304, width=8, height=4)
    world = parse_wld_bytes(data)
    assert world.metadata.version == 304


# ── T-07 ──────────────────────────────────────────────────────────────────────


def test_parse_is_deterministic_same_bytes_equal_world() -> None:
    data = build_world(width=16, height=8, name="Deterministic", hardmode=True)
    world_a = parse_wld_bytes(data)
    world_b = parse_wld_bytes(data)
    assert world_a.metadata == world_b.metadata
    assert world_a.chests == world_b.chests
    assert world_a.signs == world_b.signs
    assert world_a.tiles == world_b.tiles


# ── T-08 ──────────────────────────────────────────────────────────────────────


# ── T-51: sign text in Windows-1252 (cp1252 fallback) ────────────────────────


def test_parse_sign_with_cp1252_text_falls_back_gracefully() -> None:
    """Sign text encoded in cp1252 (not UTF-8) must parse without error.

    0xDA = 'Ú' in cp1252; invalid as UTF-8.  Before the fix, read_net_string
    raises WldParseError(code='corrupt').  After the fix it falls back to
    cp1252 and returns the correct character.
    """
    cp1252_text = "H\xdallo".encode("cp1252")  # b'H\xdallo'
    data = build_world(
        width=4,
        height=4,
        signs=[SignSpec(x=1, y=1, text_bytes=cp1252_text)],
    )
    world = parse_wld_bytes(data)
    assert len(world.signs) == 1
    assert world.signs[0].text == "H\xdallo".encode("cp1252").decode("cp1252")


@pytest.mark.perf
def test_parse_large_synthetic_world_completes_within_budget() -> None:
    """Large world (8400×2400) must parse in < 10 s."""
    data = build_world(width=8400, height=2400)
    start = time.perf_counter()
    world = parse_wld_bytes(data)
    elapsed = time.perf_counter() - start
    assert world.metadata.width == 8400
    assert world.metadata.height == 2400
    assert elapsed < 10.0, f"Parse took {elapsed:.2f}s, budget is 10s"
