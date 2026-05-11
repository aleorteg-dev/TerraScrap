"""Tests for B1 - wld-parser: NPC section parsing (iter-03)."""

from __future__ import annotations

import pytest

from tests.fixtures.wld_builder import NpcSpec, build_world
from twi.wld_parser import WldParseError, parse_wld_bytes


def test_parse_npcs_returns_same_size_and_fields() -> None:
    npcs = [
        NpcSpec(
            id=17,
            name="Guide",
            position_x=4.5,
            position_y=2.0,
            is_homeless=False,
            home_x=4,
            home_y=2,
            is_town_npc=True,
        ),
        NpcSpec(
            id=18,
            name="Merchant",
            position_x=6.0,
            position_y=3.5,
            is_homeless=True,
            home_x=-1,
            home_y=-1,
            is_town_npc=True,
        ),
    ]
    data = build_world(width=12, height=8, npcs=npcs)

    world = parse_wld_bytes(data)

    assert len(world.npcs) == len(npcs)
    for parsed, expected in zip(world.npcs, npcs, strict=True):
        assert parsed.id == expected.id
        assert parsed.name == expected.name
        assert parsed.position_x == pytest.approx(expected.position_x)
        assert parsed.position_y == pytest.approx(expected.position_y)
        assert parsed.is_homeless is expected.is_homeless
        assert parsed.home_x == expected.home_x
        assert parsed.home_y == expected.home_y
        assert parsed.is_town_npc is expected.is_town_npc


def test_parse_zero_npcs_returns_empty_list() -> None:
    data = build_world(width=8, height=4, npcs=[])

    world = parse_wld_bytes(data)

    assert world.npcs == []


def test_parse_two_npcs_in_v279_world_roundtrip_correctly() -> None:
    """v279 NPC section has no homelessDespawn byte (added in v280+).

    Two consecutive town NPCs are needed to expose the misalignment: without
    gating homelessDespawn at v280+, the parser consumes the first NPC's
    homelessDespawn byte as the flag for the second NPC, returning only 1 NPC
    instead of 2.
    """
    npcs = [
        NpcSpec(
            id=22,
            name="Jeffrey",
            position_x=5.0,
            position_y=3.0,
            is_homeless=False,
            home_x=5,
            home_y=3,
            is_town_npc=True,
        ),
        NpcSpec(
            id=17,
            name="Guide",
            position_x=2.0,
            position_y=2.0,
            is_homeless=True,
            home_x=-1,
            home_y=-1,
            is_town_npc=True,
        ),
    ]
    data = build_world(version=279, width=12, height=8, npcs=npcs)
    world = parse_wld_bytes(data)
    assert len(world.npcs) == 2
    assert world.npcs[0].id == 22
    assert world.npcs[1].id == 17


def test_parse_npc_with_position_outside_world_raises_invalid_npc() -> None:
    data = build_world(
        width=8,
        height=4,
        npcs=[
            NpcSpec(
                id=17,
                name="Guide",
                position_x=8.0,
                position_y=2.0,
                is_homeless=False,
                home_x=4,
                home_y=2,
                is_town_npc=True,
            )
        ],
    )

    with pytest.raises(WldParseError) as exc_info:
        parse_wld_bytes(data)

    assert exc_info.value.code == "invalid_npc"
