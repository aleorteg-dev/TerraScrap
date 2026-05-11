import os
import struct
from pathlib import Path

import pytest

from twi.wld_parser import WldParseError, World, parse_wld_bytes

_DEFAULT_CORPUS = Path(__file__).resolve().parent.parent / "wld_corpus"
_CORPUS_DIR = Path(os.environ.get("TWI_REAL_WLD_DIR", str(_DEFAULT_CORPUS)))


def _read_file_version(path: Path) -> int:
    raw = path.read_bytes()[:4]
    return struct.unpack("<i", raw)[0]


def _discover_wld_files() -> list[Path]:
    if not _CORPUS_DIR.is_dir():
        return []
    return sorted(_CORPUS_DIR.glob("**/*.wld"))


def _parse_world(path: Path, data: bytes, file_version: int) -> World:
    try:
        return parse_wld_bytes(data)
    except WldParseError as exc:
        pytest.fail(f"{path} (version {file_version}) failed to parse: {exc}")


_WLD_FILES = _discover_wld_files()
_NO_CORPUS_MESSAGE = "No .wld corpus found; skipping real-world integration tests"
_WLD_CASES = [pytest.param(wld_path, id=wld_path.name) for wld_path in _WLD_FILES] or [
    pytest.param(
        _CORPUS_DIR,
        marks=pytest.mark.skip(reason=_NO_CORPUS_MESSAGE),
        id="no-wld-corpus",
    )
]


@pytest.mark.real_wld
@pytest.mark.parametrize("wld_path", _WLD_CASES)
def test_real_wld_parses_with_valid_metadata(wld_path: Path) -> None:
    data = wld_path.read_bytes()
    file_version = _read_file_version(wld_path)
    world = _parse_world(wld_path, data, file_version)

    assert isinstance(world, World)
    assert world.metadata.version == file_version
    assert isinstance(world.metadata.name, str)
    assert len(world.metadata.name) > 0
    assert world.metadata.width > 0
    assert world.metadata.height > 0
    assert world.metadata.size in ("small", "medium", "large")


@pytest.mark.real_wld
@pytest.mark.parametrize("wld_path", _WLD_CASES)
def test_real_wld_tiles_match_metadata_dimensions(wld_path: Path) -> None:
    data = wld_path.read_bytes()
    file_version = _read_file_version(wld_path)
    world = _parse_world(wld_path, data, file_version)

    assert world.tiles.width == world.metadata.width
    assert world.tiles.height == world.metadata.height


@pytest.mark.real_wld
@pytest.mark.parametrize("wld_path", _WLD_CASES)
def test_real_wld_tile_access_at_key_positions(wld_path: Path) -> None:
    data = wld_path.read_bytes()
    file_version = _read_file_version(wld_path)
    world = _parse_world(wld_path, data, file_version)
    w, h = world.metadata.width, world.metadata.height

    _ = world.tiles[0][0]
    _ = world.tiles[w // 2][h // 2]
    _ = world.tiles[w - 1][h - 1]


def test_parse_v319_real_world_footer_validates_correctly() -> None:
    """El_Ínsula_Ultranervioso.wld (v319, num_sections > 7) must parse without
    invalid_footer error.  Regression for the offsets[6] vs offsets[-1] bug."""
    wld_path = _CORPUS_DIR / "El_Ínsula_Ultranervioso.wld"
    if not wld_path.exists():
        pytest.skip(f"{wld_path.name} not found in corpus")
    data = wld_path.read_bytes()
    world = parse_wld_bytes(data)
    assert isinstance(world, World)
    assert world.metadata.version == 319


def test_read_file_version_extracts_little_endian_int32(tmp_path: Path) -> None:
    fake = tmp_path / "fake.wld"
    fake.write_bytes(struct.pack("<i", 269) + b"\x00" * 100)
    assert _read_file_version(fake) == 269
