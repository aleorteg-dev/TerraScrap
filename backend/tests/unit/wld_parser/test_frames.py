"""Tests for B1 – wld-parser: frame_x / frame_y on Tile."""

from __future__ import annotations

from tests.fixtures.wld_builder import build_world
from twi.wld_parser import parse_wld_bytes

# ── frame_x / frame_y read on frame-important tile ────────────────────────────


def test_parse_framed_tile_reads_frame_x_y() -> None:
    """Tile 3 (Grass Flowers) with importance true: U=18, V=0 round-trips."""
    data = build_world(
        width=4,
        height=4,
        tile_id_at={(1, 1): 3},
        tile_frame_at={(1, 1): (18, 0)},
        frame_important_ids={3},
    )
    world = parse_wld_bytes(data)
    tile = world.tiles[1][1]
    assert tile.tile_id == 3
    assert tile.frame_x == 18
    assert tile.frame_y == 0


# ── unframed tile keeps frames as None ────────────────────────────────────────


def test_parse_unframed_tile_has_none_frames() -> None:
    """Tile id 0 with importance false: frame_x and frame_y are None."""
    data = build_world(
        width=4,
        height=4,
        tile_id_at={(0, 0): 0},
    )
    world = parse_wld_bytes(data)
    tile = world.tiles[0][0]
    assert tile.tile_id == 0
    assert tile.frame_x is None
    assert tile.frame_y is None


# ── tile_id 144 (Timers) forces frame_y=0 even if file stores otherwise ───────


def test_parse_tile_id_144_forces_frame_y_zero() -> None:
    data = build_world(
        width=4,
        height=4,
        tile_id_at={(2, 2): 144},
        tile_frame_at={(2, 2): (36, 99)},
        frame_important_ids={144},
    )
    world = parse_wld_bytes(data)
    tile = world.tiles[2][2]
    assert tile.tile_id == 144
    assert tile.frame_x == 36
    assert tile.frame_y == 0


# ── round-trip builder → parser preserves frames for several placements ───────


def test_round_trip_builder_parser_preserves_frames() -> None:
    placements: dict[tuple[int, int], tuple[int, int, int]] = {
        (0, 0): (3, 18, 0),
        (1, 0): (3, 36, 0),
        (2, 0): (3, 54, 0),
        (3, 1): (3, 0, 0),
    }
    data = build_world(
        width=4,
        height=4,
        tile_id_at={pos: spec[0] for pos, spec in placements.items()},
        tile_frame_at={pos: (spec[1], spec[2]) for pos, spec in placements.items()},
        frame_important_ids={3},
    )
    world = parse_wld_bytes(data)
    for (x, y), (tid, fx, fy) in placements.items():
        tile = world.tiles[x][y]
        assert tile.tile_id == tid
        assert tile.frame_x == fx
        assert tile.frame_y == fy
