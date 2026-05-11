"""B1 wld-parser iter-05: multi-byte walls and footer validation (T-45..T-48)."""

from __future__ import annotations

import struct

import pytest

from tests.fixtures.wld_builder import build_world
from twi.wld_parser import WldParseError, parse_wld_bytes


def _footer_offset(data: bytes) -> int:
    """Return byte position of section-6 (footer) in a 7-section world binary."""
    # Header layout: version(4) magic(7) type(1) revision(4) favorites(8)
    # num_sections(2) offsets[0..6](7*4=28) → offsets[6] starts at byte 50.
    return int(struct.unpack_from("<i", data, 26 + 6 * 4)[0])


# ── T-45: multi-byte wall_id ──────────────────────────────────────────────────


def test_parse_multibyte_wall_id_round_trips() -> None:
    """wall_id=300 (> 255) encodes as 2 bytes (flags3 bit6) and decodes correctly."""
    data = build_world(
        width=4,
        height=4,
        wall_id_at={(1, 2): 300},
    )
    world = parse_wld_bytes(data)
    tile = world.tiles[1][2]
    assert tile.wall_id == 300


# ── T-46: footer flag=0 → invalid_footer ─────────────────────────────────────


def test_parse_footer_invalid_flag_raises_invalid_footer() -> None:
    """Footer flag byte == 0 must raise WldParseError(code='invalid_footer')."""
    data = bytearray(build_world(name="TestWorld", width=4, height=4))
    pos = _footer_offset(bytes(data))
    data[pos] = 0  # corrupt: flag must be True (1)
    with pytest.raises(WldParseError) as exc_info:
        parse_wld_bytes(bytes(data))
    assert exc_info.value.code == "invalid_footer"


# ── T-47: footer truncated → invalid_footer ───────────────────────────────────


def test_parse_footer_truncated_raises_invalid_footer() -> None:
    """File truncated at footer offset raises WldParseError(code='invalid_footer')."""
    data = build_world(name="TestWorld", width=4, height=4)
    pos = _footer_offset(data)
    truncated = data[:pos]  # footer section has zero bytes
    with pytest.raises(WldParseError) as exc_info:
        parse_wld_bytes(truncated)
    assert exc_info.value.code == "invalid_footer"


# ── T-48: footer name mismatch → invalid_footer ───────────────────────────────


# ── T-49: footer at offsets[-1] when num_sections > 7 ────────────────────────


def test_parse_footer_uses_last_offset_when_extra_sections_present() -> None:
    """World with num_sections > 7 (extra_sections=4) parses without error.

    Footer lives at offsets[-1], not offsets[6].  Before the fix this test
    raises WldParseError(code='invalid_footer') because the parser seeks to
    offsets[6] which points into the empty-section gap, not the real footer.
    """
    data = build_world(name="MultiSect", width=4, height=4, extra_sections=4)
    world = parse_wld_bytes(data)
    assert world.metadata.name == "MultiSect"


# ── T-48: footer name mismatch → invalid_footer ───────────────────────────────


def test_parse_footer_name_mismatch_raises_invalid_footer() -> None:
    """Footer world name different from header name raises invalid_footer."""
    data = bytearray(build_world(name="TestWorld", width=4, height=4))
    pos = _footer_offset(bytes(data))
    # Footer layout: bool(1) + .NET string(name) + int32(world_id)
    # Overwrite the flag with True (keep it) then immediately write a wrong
    # .NET string by patching the length byte to 0 and replacing the name
    # payload with a single 'X' byte (length 1, different from "TestWorld").
    data[pos] = 1  # flag stays True
    data[pos + 1] = 1  # length = 1 (was len("TestWorld")=9)
    data[pos + 2] = ord("X")  # name = "X" ≠ "TestWorld"
    with pytest.raises(WldParseError) as exc_info:
        parse_wld_bytes(bytes(data))
    assert exc_info.value.code == "invalid_footer"
