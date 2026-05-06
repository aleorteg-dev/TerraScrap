"""Tests for B1 – wld-parser: extended WorldMetadata fields (iter-02).

T-26 through T-31: spawn_x/y, world_surface_y, rock_layer_y, hell_layer_y.
"""

from __future__ import annotations

import struct as _struct

import pytest

from tests.fixtures.wld_builder import build_world
from twi.wld_parser import WldParseError, parse_wld_bytes

# ── T-26 ──────────────────────────────────────────────────────────────────────


def test_parse_metadata_exposes_spawn_x_y() -> None:
    """Metadata.spawn_x and spawn_y match values written by the builder."""
    data = build_world(width=8, height=4, spawn_x=4200, spawn_y=350)
    world = parse_wld_bytes(data)
    assert world.metadata.spawn_x == 4200
    assert world.metadata.spawn_y == 350


# ── T-27 ──────────────────────────────────────────────────────────────────────


def test_parse_metadata_exposes_world_surface_y() -> None:
    """Metadata.world_surface_y matches the float64 written by the builder."""
    data = build_world(width=8, height=4, world_surface_y=320.5)
    world = parse_wld_bytes(data)
    assert world.metadata.world_surface_y == pytest.approx(320.5)


# ── T-28 ──────────────────────────────────────────────────────────────────────


def test_parse_metadata_exposes_rock_layer_y() -> None:
    """Metadata.rock_layer_y matches the float64 written by the builder."""
    data = build_world(width=8, height=4, rock_layer_y=900.0)
    world = parse_wld_bytes(data)
    assert world.metadata.rock_layer_y == pytest.approx(900.0)


# ── T-29 ──────────────────────────────────────────────────────────────────────


def test_parse_metadata_hell_layer_y_derived_from_terramap_formula() -> None:
    """hell_layer_y computed via TerraMap formula: ((h-230)-surf)/6 * 6 + surf - 5."""
    height = 1200
    surface = 200.0
    data = build_world(width=8, height=height, world_surface_y=surface)
    world = parse_wld_bytes(data)

    expected = ((height - 230) - surface) / 6.0 * 6.0 + surface - 5.0
    assert world.metadata.hell_layer_y == pytest.approx(expected)


# ── T-30 ──────────────────────────────────────────────────────────────────────


def test_parse_metadata_new_field_types_are_correct() -> None:
    """spawn_x/y are int; surface/rock/hell layer values are float."""
    data = build_world(
        width=8,
        height=4,
        spawn_x=50,
        spawn_y=30,
        world_surface_y=100.0,
        rock_layer_y=300.0,
    )
    world = parse_wld_bytes(data)
    md = world.metadata

    assert isinstance(md.spawn_x, int)
    assert isinstance(md.spawn_y, int)
    assert isinstance(md.world_surface_y, float)
    assert isinstance(md.rock_layer_y, float)
    assert isinstance(md.hell_layer_y, float)


# ── T-31 ──────────────────────────────────────────────────────────────────────


def test_parse_world_info_truncated_before_spawn_raises_invalid_world_info() -> None:
    """Section-0 truncated inside tree-style block raises code='invalid_world_info'."""
    data = build_world(version=269, width=4, height=4)

    # off0 is stored at byte 26 of the file (after version+magic+filetype+revision+
    # favorites+num_sections = 4+7+1+4+8+2 = 26 bytes).
    off0 = _struct.unpack_from("<i", data, 26)[0]

    # Section-0 layout up to moonType (90 bytes for default name/seed/v269 gates).
    # Tree-style block (17 int32s = 68 bytes) follows moonType.
    # Truncating 100 bytes past off0 lands mid-tree-styles, before spawn_x.
    truncated = data[: off0 + 100]

    with pytest.raises(WldParseError) as exc_info:
        parse_wld_bytes(truncated)
    assert exc_info.value.code == "invalid_world_info"
