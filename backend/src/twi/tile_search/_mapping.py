"""Loading and validation for B4 item-to-world mappings."""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, TypeGuard, cast

WorldMapCategory = Literal["block", "wall", "object"]

_ROOT_KEYS: Final[frozenset[str]] = frozenset({"items", "version"})
_ENTRY_KEYS: Final[frozenset[str]] = frozenset(
    {"category", "tile_id", "wall_id", "frame_xy"}
)
_CATEGORIES: Final[tuple[WorldMapCategory, ...]] = ("block", "wall", "object")


@dataclass(frozen=True)
class WorldMapEntry:
    category: WorldMapCategory
    tile_id: int | None = None
    wall_id: int | None = None
    frame_xy: tuple[int, int] | None = None


@dataclass(frozen=True)
class ItemWorldMap:
    version: str
    entries: Mapping[int, WorldMapEntry]


def load_item_world_map(path: Path) -> ItemWorldMap:
    with path.open(encoding="utf-8") as f:
        raw: object = json.load(f)

    data = _as_str_object_map(raw, "item_world_map root")
    unknown_root_keys = set(data) - _ROOT_KEYS
    if unknown_root_keys:
        keys = ", ".join(sorted(unknown_root_keys))
        raise ValueError(f"item_world_map has unknown root keys: {keys}")

    version = data.get("version")
    if not isinstance(version, str) or not _is_semver(version):
        raise ValueError("item_world_map.version must be a semver string")

    raw_items = _as_str_object_map(data.get("items"), "item_world_map.items")
    entries: dict[int, WorldMapEntry] = {}
    for raw_item_id, raw_entry in raw_items.items():
        item_id = _parse_item_id(raw_item_id)
        entries[item_id] = _parse_entry(item_id, raw_entry)

    return create_item_world_map(version=version, entries=entries)


def create_item_world_map(
    version: str,
    entries: Mapping[int, WorldMapEntry],
) -> ItemWorldMap:
    if not _is_semver(version):
        raise ValueError("item_world_map.version must be a semver string")

    entries_dict = dict(entries)
    for item_id, entry in entries_dict.items():
        _validate_entry(item_id, entry)
    _validate_collisions(entries_dict)
    return ItemWorldMap(version=version, entries=entries_dict)


def _parse_item_id(raw_item_id: str) -> int:
    if not raw_item_id.isdecimal():
        raise ValueError(f"item_id key must be decimal: {raw_item_id!r}")
    return int(raw_item_id)


def _parse_entry(item_id: int, raw_entry: object) -> WorldMapEntry:
    entry = _as_str_object_map(raw_entry, f"item_world_map.items.{item_id}")
    unknown_keys = set(entry) - _ENTRY_KEYS
    if unknown_keys:
        keys = ", ".join(sorted(unknown_keys))
        raise ValueError(f"item {item_id} has unknown keys: {keys}")

    category_raw = entry.get("category")
    if category_raw not in _CATEGORIES:
        raise ValueError(f"item {item_id} has invalid category: {category_raw!r}")
    category = category_raw

    frame_xy = _parse_optional_frame_xy(item_id, entry)
    if category == "wall":
        if "tile_id" in entry or "frame_xy" in entry:
            raise ValueError(f"wall item {item_id} must not define tile_id/frame_xy")
        return WorldMapEntry(
            category=category,
            wall_id=_required_int(entry, "wall_id", item_id),
        )

    if "wall_id" in entry:
        raise ValueError(f"{category} item {item_id} must not define wall_id")
    if category == "block" and frame_xy is not None:
        raise ValueError(f"block item {item_id} must not define frame_xy")

    return WorldMapEntry(
        category=category,
        tile_id=_required_int(entry, "tile_id", item_id),
        frame_xy=frame_xy,
    )


def _parse_optional_frame_xy(
    item_id: int,
    entry: Mapping[str, object],
) -> tuple[int, int] | None:
    if "frame_xy" not in entry:
        return None

    raw_frame_xy = entry["frame_xy"]
    if not isinstance(raw_frame_xy, list) or len(raw_frame_xy) != 2:
        raise ValueError(f"item {item_id} frame_xy must be [int, int]")

    frame_values = cast(list[object], raw_frame_xy)
    frame_x = frame_values[0]
    frame_y = frame_values[1]
    if not _is_int(frame_x) or not _is_int(frame_y):
        raise ValueError(f"item {item_id} frame_xy must be [int, int]")
    return frame_x, frame_y


def _required_int(entry: Mapping[str, object], key: str, item_id: int) -> int:
    value = entry.get(key)
    if not _is_int(value):
        raise ValueError(f"item {item_id} requires integer {key}")
    return value


def _validate_entry(item_id: int, entry: WorldMapEntry) -> None:
    if entry.category == "wall":
        if not _is_int(entry.wall_id):
            raise ValueError(f"wall item {item_id} requires wall_id")
        if entry.tile_id is not None or entry.frame_xy is not None:
            raise ValueError(f"wall item {item_id} must not define tile_id/frame_xy")
        return

    if not _is_int(entry.tile_id):
        raise ValueError(f"{entry.category} item {item_id} requires tile_id")
    if entry.wall_id is not None:
        raise ValueError(f"{entry.category} item {item_id} must not define wall_id")
    if entry.category == "block" and entry.frame_xy is not None:
        raise ValueError(f"block item {item_id} must not define frame_xy")


def _validate_collisions(entries: Mapping[int, WorldMapEntry]) -> None:
    seen_any: dict[tuple[WorldMapCategory, int], int] = {}
    seen_without_frame: dict[tuple[WorldMapCategory, int], int] = {}
    for item_id, entry in entries.items():
        key = (entry.category, _entry_world_id(entry))
        previous_item_id = seen_any.get(key)
        previous_without_frame = seen_without_frame.get(key)
        if previous_item_id is not None and (
            entry.frame_xy is None or previous_without_frame is not None
        ):
            raise ValueError(
                "item_world_map collision for "
                f"{key}: item {previous_item_id} and item {item_id}"
            )
        seen_any.setdefault(key, item_id)
        if entry.frame_xy is None:
            seen_without_frame[key] = item_id


def _entry_world_id(entry: WorldMapEntry) -> int:
    if entry.category == "wall":
        wall_id = entry.wall_id
        if wall_id is None:
            raise ValueError("wall entry requires wall_id")
        return wall_id

    tile_id = entry.tile_id
    if tile_id is None:
        raise ValueError(f"{entry.category} entry requires tile_id")
    return tile_id


def _as_str_object_map(value: object, context: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValueError(f"{context} must be an object")

    raw_map = cast(Mapping[object, object], value)
    result: dict[str, object] = {}
    for key, raw_value in raw_map.items():
        if not isinstance(key, str):
            raise ValueError(f"{context} keys must be strings")
        result[key] = raw_value
    return result


def _is_semver(value: str) -> bool:
    parts = value.split(".")
    return len(parts) == 3 and all(part.isdecimal() for part in parts)


def _is_int(value: object) -> TypeGuard[int]:
    return isinstance(value, int) and not isinstance(value, bool)
