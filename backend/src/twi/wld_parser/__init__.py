"""Public contract for B1 – wld-parser."""

import io
from collections.abc import Callable

from twi.wld_parser._exceptions import UnsupportedWorldVersionError, WldParseError
from twi.wld_parser._parser import parse_wld
from twi.wld_parser._types import (
    BackgroundStyles,
    Chest,
    ChestItem,
    Npc,
    Sign,
    Tile,
    TileEntity,
    TileGrid,
    World,
    WorldMetadata,
)


def parse_wld_bytes(
    data: bytes,
    on_progress: Callable[[int], None] | None = None,
) -> World:
    return parse_wld(io.BytesIO(data), on_progress)


__all__ = [
    "BackgroundStyles",
    "Chest",
    "ChestItem",
    "Npc",
    "Sign",
    "Tile",
    "TileEntity",
    "TileGrid",
    "UnsupportedWorldVersionError",
    "WldParseError",
    "World",
    "WorldMetadata",
    "parse_wld",
    "parse_wld_bytes",
]
