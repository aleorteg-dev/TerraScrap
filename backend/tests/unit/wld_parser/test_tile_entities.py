"""Tests for B1 – wld-parser: tile entity section parsing (iter-04).

T-35  empty tile entities → list is empty
T-36  type 0 (target dummy) → data has npc_id field
T-37  type 1 (item frame) → data has item_id, prefix_id, stack
T-38  type 2 (logic sensor) → data has logic_check_type, on
T-39  type 7 (pylon) → data is empty dict
T-40  type 3 (mannequin, empty slots) → data has all item/dye/misc keys zeroed
T-41  type 5 (hat rack, empty slots) → data has all item/dye keys zeroed
T-42  unknown type emits warning + stops, no exception
T-43  multiple entities parse in order; entities before unknown type are kept
T-44  round-trip: WldBuilder.add_tile_entity produces parseable entities
"""

from __future__ import annotations

import logging

import pytest

from tests.fixtures.wld_builder import (
    TileEntitySpec,
    WldBuilder,
    build_world,
    te_anchor,
    te_hat_rack_empty,
    te_item,
    te_logic_sensor,
    te_mannequin_empty,
    te_pylon,
    te_target_dummy,
)
from twi.wld_parser import TileEntity, parse_wld_bytes

# ── T-35 ──────────────────────────────────────────────────────────────────────


def test_parse_zero_tile_entities_returns_empty_list() -> None:
    data = build_world(width=8, height=4, tile_entities=[])
    world = parse_wld_bytes(data)
    assert world.tile_entities == []


# ── T-36 ──────────────────────────────────────────────────────────────────────


def test_parse_tile_entity_type0_target_dummy() -> None:
    specs = [TileEntitySpec(entity_type=0, x=3, y=2, payload=te_target_dummy(npc_id=7))]
    world = parse_wld_bytes(build_world(width=8, height=4, tile_entities=specs))
    assert len(world.tile_entities) == 1
    te = world.tile_entities[0]
    assert te.entity_type == 0
    assert te.x == 3
    assert te.y == 2
    assert te.data["npc_id"] == 7


# ── T-37 ──────────────────────────────────────────────────────────────────────


def test_parse_tile_entity_type1_item_frame() -> None:
    specs = [
        TileEntitySpec(
            entity_type=1,
            x=10,
            y=5,
            payload=te_item(item_id=3930, prefix_id=3, stack=1),
        )
    ]
    world = parse_wld_bytes(build_world(width=16, height=8, tile_entities=specs))
    te = world.tile_entities[0]
    assert te.entity_type == 1
    assert te.x == 10
    assert te.y == 5
    assert te.data["item_id"] == 3930
    assert te.data["prefix_id"] == 3
    assert te.data["stack"] == 1


def test_parse_tile_entity_type4_weapon_rack_has_item_fields() -> None:
    specs = [
        TileEntitySpec(entity_type=4, x=1, y=1, payload=te_item(item_id=757, stack=1))
    ]
    world = parse_wld_bytes(build_world(width=8, height=4, tile_entities=specs))
    assert world.tile_entities[0].entity_type == 4
    assert world.tile_entities[0].data["item_id"] == 757


# ── T-38 ──────────────────────────────────────────────────────────────────────


def test_parse_tile_entity_type2_logic_sensor() -> None:
    specs = [
        TileEntitySpec(
            entity_type=2, x=2, y=3, payload=te_logic_sensor(logic_check_type=1, on=1)
        )
    ]
    world = parse_wld_bytes(build_world(width=8, height=4, tile_entities=specs))
    te = world.tile_entities[0]
    assert te.entity_type == 2
    assert te.data["logic_check_type"] == 1
    assert te.data["on"] == 1


# ── T-39 ──────────────────────────────────────────────────────────────────────


def test_parse_tile_entity_type7_pylon_data_is_empty() -> None:
    specs = [TileEntitySpec(entity_type=7, x=4, y=2, payload=te_pylon())]
    world = parse_wld_bytes(build_world(width=8, height=4, tile_entities=specs))
    te = world.tile_entities[0]
    assert te.entity_type == 7
    assert te.data == {}


# ── T-40 ──────────────────────────────────────────────────────────────────────


def test_parse_tile_entity_type3_mannequin_empty_slots() -> None:
    specs = [TileEntitySpec(entity_type=3, x=5, y=2, payload=te_mannequin_empty())]
    world = parse_wld_bytes(build_world(width=8, height=4, tile_entities=specs))
    te = world.tile_entities[0]
    assert te.entity_type == 3
    # All 9 item slots zeroed
    for i in range(9):
        assert te.data[f"item_{i}_id"] == 0
        assert te.data[f"item_{i}_prefix"] == 0
        assert te.data[f"item_{i}_stack"] == 0
    # All 9 dye slots zeroed
    for j in range(9):
        assert te.data[f"dye_{j}_id"] == 0
    # misc slot zeroed
    assert te.data["misc_0_id"] == 0


# ── T-41 ──────────────────────────────────────────────────────────────────────


def test_parse_tile_entity_type5_hat_rack_empty_slots() -> None:
    specs = [TileEntitySpec(entity_type=5, x=6, y=1, payload=te_hat_rack_empty())]
    world = parse_wld_bytes(build_world(width=8, height=4, tile_entities=specs))
    te = world.tile_entities[0]
    assert te.entity_type == 5
    for i in range(2):
        assert te.data[f"item_{i}_id"] == 0
        assert te.data[f"dye_{i}_id"] == 0


# ── T-42 ──────────────────────────────────────────────────────────────────────


def test_parse_unknown_tile_entity_type_emits_warning_no_exception(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # type 11 is beyond _MAX_TILE_ENTITY_TYPE (10) → unknown
    specs = [TileEntitySpec(entity_type=11, x=2, y=2, payload=b"")]
    with caplog.at_level(logging.WARNING, logger="twi.wld_parser._parser"):
        world = parse_wld_bytes(build_world(width=8, height=4, tile_entities=specs))
    assert world.tile_entities == []
    assert any("Unknown tile entity type" in r.message for r in caplog.records)


# ── T-43 ──────────────────────────────────────────────────────────────────────


def test_parse_entities_before_unknown_type_are_kept(
    caplog: pytest.LogCaptureFixture,
) -> None:
    specs = [
        TileEntitySpec(entity_type=7, x=1, y=1, payload=te_pylon()),  # known
        TileEntitySpec(entity_type=11, x=2, y=2, payload=b""),  # unknown → stop
    ]
    with caplog.at_level(logging.WARNING, logger="twi.wld_parser._parser"):
        world = parse_wld_bytes(build_world(width=8, height=4, tile_entities=specs))
    assert len(world.tile_entities) == 1
    assert world.tile_entities[0].entity_type == 7


# ── T-44 ──────────────────────────────────────────────────────────────────────


def test_wld_builder_add_tile_entity_round_trip() -> None:
    builder = WldBuilder(width=8, height=4)
    builder.add_tile_entity(
        entity_type=1, x=3, y=2, payload=te_item(item_id=50, stack=1)
    )
    builder.add_tile_entity(entity_type=7, x=5, y=3, payload=te_pylon())
    builder.add_tile_entity(entity_type=9, x=6, y=1, payload=te_anchor(item_id=123))
    world = parse_wld_bytes(builder.build())
    assert len(world.tile_entities) == 3
    assert isinstance(world.tile_entities[0], TileEntity)
    assert world.tile_entities[0].data["item_id"] == 50
    assert world.tile_entities[1].data == {}
    assert world.tile_entities[2].data["item_id"] == 123
