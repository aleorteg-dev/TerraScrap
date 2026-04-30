"""Unit tests for B1 – wld-parser (T-01 through T-08)."""

from __future__ import annotations

import time

import pytest

from tests.fixtures.wld_builder import ChestSpec, build_world
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
    data = build_world(version=300)
    with pytest.raises(UnsupportedWorldVersionError) as exc_info:
        parse_wld_bytes(data)
    assert exc_info.value.version == 300


def test_parse_rejects_version_319_with_user_facing_details() -> None:
    data = build_world(version=319)
    with pytest.raises(UnsupportedWorldVersionError) as exc_info:
        parse_wld_bytes(data)

    exc = exc_info.value
    assert exc.code == "unsupported_version"
    assert exc.version == 319
    assert exc.detected_version == 319
    assert exc.supported_range == (230, 279)
    assert exc.details == {
        "detected_version": 319,
        "supported_range": (230, 279),
    }
    message = str(exc)
    assert "319" in message
    assert "230-279" in message
    assert "not supported" in message.lower()


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
