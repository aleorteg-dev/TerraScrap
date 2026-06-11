"""Tests for B1 – wld-parser: liquid_type / liquid_amount on Tile (iter-020)."""

from __future__ import annotations

from tests.fixtures.wld_builder import build_world
from twi.wld_parser import parse_wld_bytes


def test_parse_water_tile_amount_and_type() -> None:
    """Tile with water: liquid_type=='water', liquid_amount==200."""
    data = build_world(
        width=4,
        height=4,
        liquid_at={(1, 1): ("water", 200)},
    )
    world = parse_wld_bytes(data)
    tile = world.tiles[1][1]
    assert tile.liquid_type == "water"
    assert tile.liquid_amount == 200


def test_parse_lava_tile() -> None:
    """Tile with lava: liquid_type=='lava', amount==128."""
    data = build_world(
        width=4,
        height=4,
        liquid_at={(0, 2): ("lava", 128)},
    )
    world = parse_wld_bytes(data)
    tile = world.tiles[0][2]
    assert tile.liquid_type == "lava"
    assert tile.liquid_amount == 128


def test_parse_honey_tile() -> None:
    """Tile with honey: liquid_type=='honey', amount==50."""
    data = build_world(
        width=4,
        height=4,
        liquid_at={(3, 0): ("honey", 50)},
    )
    world = parse_wld_bytes(data)
    tile = world.tiles[3][0]
    assert tile.liquid_type == "honey"
    assert tile.liquid_amount == 50


def test_parse_shimmer_tile() -> None:
    """Tile with shimmer (b5==1 + flags3 bit7): liquid_type=='shimmer'."""
    data = build_world(
        width=4,
        height=4,
        liquid_at={(2, 3): ("shimmer", 255)},
    )
    world = parse_wld_bytes(data)
    tile = world.tiles[2][3]
    assert tile.liquid_type == "shimmer"
    assert tile.liquid_amount == 255


def test_parse_dry_tile() -> None:
    """Air tile with no liquid: liquid_type=='none', liquid_amount==0."""
    data = build_world(width=4, height=4)
    world = parse_wld_bytes(data)
    tile = world.tiles[0][0]
    assert tile.liquid_type == "none"
    assert tile.liquid_amount == 0
