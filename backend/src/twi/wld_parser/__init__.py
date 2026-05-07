"""Public contract for B1 – wld-parser."""

import io

from twi.wld_parser._exceptions import UnsupportedWorldVersionError, WldParseError
from twi.wld_parser._parser import parse_wld
from twi.wld_parser._types import (
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


def parse_wld_bytes(data: bytes) -> World:
    return parse_wld(io.BytesIO(data))


__all__ = [
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
