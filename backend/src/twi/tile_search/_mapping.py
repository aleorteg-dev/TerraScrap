"""Loading and validation for B4 item-to-world mappings.

Schema v2.0.0 (iter-12):
- Root: ``{"schema_version": "2.0.0", "items": {<id>: [matcher, ...]}}``.
- Each item maps to a non-empty list of matchers (alias support).
- Wall matcher: ``wall_id`` (single) or ``wall_ids`` (multi-wall).
- Object matcher: optional ``frame_xy`` (single) or ``frame_xys`` (multi-frame).
- ``MappingStaleError`` raised when ``schema_version`` is missing/different.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, TypeGuard, cast

WorldMapCategory = Literal["block", "wall", "object"]

SCHEMA_VERSION: Final[str] = "2.0.0"

_ROOT_KEYS: Final[frozenset[str]] = frozenset({"items", "schema_version"})
_MATCHER_KEYS: Final[frozenset[str]] = frozenset(
    {"category", "tile_id", "wall_id", "wall_ids", "frame_xy", "frame_xys"}
)
_CATEGORIES: Final[tuple[WorldMapCategory, ...]] = ("block", "wall", "object")


class MappingStaleError(ValueError):
    """JSON mapping file does not match the current ``SCHEMA_VERSION``."""


@dataclass(frozen=True)
class ItemMatcher:
    category: WorldMapCategory
    tile_id: int | None = None
    wall_ids: tuple[int, ...] = ()
    frame_xys: tuple[tuple[int, int], ...] = ()


@dataclass(frozen=True)
class ItemWorldMap:
    schema_version: str
    entries: Mapping[int, tuple[ItemMatcher, ...]]


def load_item_world_map(path: Path) -> ItemWorldMap:
    with path.open(encoding="utf-8") as f:
        raw: object = json.load(f)

    data = _as_str_object_map(raw, "item_world_map root")
    unknown_root_keys = set(data) - _ROOT_KEYS
    if unknown_root_keys:
        keys = ", ".join(sorted(unknown_root_keys))
        raise MappingStaleError(
            f"item_world_map has unknown root keys: {keys}; "
            f"expected schema_version={SCHEMA_VERSION!r}"
        )

    schema_version = data.get("schema_version")
    if not isinstance(schema_version, str) or schema_version != SCHEMA_VERSION:
        raise MappingStaleError(
            f"item_world_map schema_version={schema_version!r} does not match "
            f"expected {SCHEMA_VERSION!r}; migrate the JSON file"
        )

    raw_items = _as_str_object_map(data.get("items"), "item_world_map.items")
    entries: dict[int, tuple[ItemMatcher, ...]] = {}
    for raw_item_id, raw_matchers in raw_items.items():
        item_id = _parse_item_id(raw_item_id)
        entries[item_id] = _parse_matchers(item_id, raw_matchers)

    return create_item_world_map(schema_version=schema_version, entries=entries)


def create_item_world_map(
    schema_version: str,
    entries: Mapping[int, tuple[ItemMatcher, ...]],
) -> ItemWorldMap:
    if schema_version != SCHEMA_VERSION:
        raise MappingStaleError(
            f"schema_version {schema_version!r} not supported; "
            f"expected {SCHEMA_VERSION!r}"
        )

    entries_dict: dict[int, tuple[ItemMatcher, ...]] = {}
    for item_id, matchers in entries.items():
        if not matchers:
            raise ValueError(f"item {item_id} requires at least one matcher")
        for matcher in matchers:
            _validate_matcher(item_id, matcher)
        entries_dict[item_id] = tuple(matchers)

    _validate_collisions(entries_dict)
    return ItemWorldMap(schema_version=schema_version, entries=entries_dict)


def _parse_matchers(item_id: int, raw: object) -> tuple[ItemMatcher, ...]:
    if not isinstance(raw, list):
        raise ValueError(f"item {item_id} value must be a list of matchers")
    raw_list = cast(list[object], raw)
    if not raw_list:
        raise ValueError(f"item {item_id} requires at least one matcher")
    return tuple(_parse_matcher(item_id, m) for m in raw_list)


def _parse_matcher(item_id: int, raw: object) -> ItemMatcher:
    entry = _as_str_object_map(raw, f"item_world_map.items.{item_id} matcher")
    unknown_keys = set(entry) - _MATCHER_KEYS
    if unknown_keys:
        keys = ", ".join(sorted(unknown_keys))
        raise ValueError(f"item {item_id} matcher has unknown keys: {keys}")

    category_raw = entry.get("category")
    if category_raw not in _CATEGORIES:
        raise ValueError(
            f"item {item_id} matcher has invalid category: {category_raw!r}"
        )
    category = category_raw

    if category == "wall":
        if "tile_id" in entry or "frame_xy" in entry or "frame_xys" in entry:
            raise ValueError(
                f"wall matcher for item {item_id} must only define wall_id/wall_ids"
            )
        return ItemMatcher(category="wall", wall_ids=_parse_wall_ids(item_id, entry))

    if "wall_id" in entry or "wall_ids" in entry:
        raise ValueError(
            f"{category} matcher for item {item_id} must not define wall ids"
        )
    tile_id = _required_int(entry, "tile_id", item_id)

    if category == "block":
        if "frame_xy" in entry or "frame_xys" in entry:
            raise ValueError(f"block matcher for item {item_id} must not define frames")
        return ItemMatcher(category="block", tile_id=tile_id)

    return ItemMatcher(
        category="object",
        tile_id=tile_id,
        frame_xys=_parse_frames(item_id, entry),
    )


def _parse_wall_ids(item_id: int, entry: Mapping[str, object]) -> tuple[int, ...]:
    has_single = "wall_id" in entry
    has_many = "wall_ids" in entry
    if has_single == has_many:
        raise ValueError(
            f"wall matcher for item {item_id} requires exactly one of wall_id/wall_ids"
        )
    if has_single:
        wall_id = entry["wall_id"]
        if not _is_int(wall_id):
            raise ValueError(f"item {item_id} wall_id must be an int")
        return (wall_id,)

    raw_list = entry["wall_ids"]
    if not isinstance(raw_list, list) or not raw_list:
        raise ValueError(f"item {item_id} wall_ids must be a non-empty list of int")
    items = cast(list[object], raw_list)
    parsed: list[int] = []
    for value in items:
        if not _is_int(value):
            raise ValueError(f"item {item_id} wall_ids must be ints")
        parsed.append(value)
    return tuple(parsed)


def _parse_frames(
    item_id: int,
    entry: Mapping[str, object],
) -> tuple[tuple[int, int], ...]:
    if "frame_xy" in entry and "frame_xys" in entry:
        raise ValueError(
            f"item {item_id} matcher cannot define both frame_xy and frame_xys"
        )
    if "frame_xy" in entry:
        return (_parse_frame_pair(item_id, entry["frame_xy"]),)
    if "frame_xys" in entry:
        raw_list = entry["frame_xys"]
        if not isinstance(raw_list, list) or not raw_list:
            raise ValueError(
                f"item {item_id} frame_xys must be a non-empty list of [int, int]"
            )
        items = cast(list[object], raw_list)
        return tuple(_parse_frame_pair(item_id, value) for value in items)
    return ()


def _parse_frame_pair(item_id: int, raw: object) -> tuple[int, int]:
    if not isinstance(raw, list) or len(raw) != 2:
        raise ValueError(f"item {item_id} frame must be [int, int]")
    pair = cast(list[object], raw)
    frame_x = pair[0]
    frame_y = pair[1]
    if not _is_int(frame_x) or not _is_int(frame_y):
        raise ValueError(f"item {item_id} frame must be [int, int]")
    return frame_x, frame_y


def _required_int(entry: Mapping[str, object], key: str, item_id: int) -> int:
    value = entry.get(key)
    if not _is_int(value):
        raise ValueError(f"item {item_id} requires integer {key}")
    return value


def _validate_matcher(item_id: int, matcher: ItemMatcher) -> None:
    if matcher.category == "wall":
        if not matcher.wall_ids:
            raise ValueError(f"wall matcher for item {item_id} requires wall_ids")
        if matcher.tile_id is not None or matcher.frame_xys:
            raise ValueError(
                f"wall matcher for item {item_id} must not define tile_id/frames"
            )
        return

    if matcher.tile_id is None:
        raise ValueError(
            f"{matcher.category} matcher for item {item_id} requires tile_id"
        )
    if matcher.wall_ids:
        raise ValueError(
            f"{matcher.category} matcher for item {item_id} must not define wall_ids"
        )
    if matcher.category == "block" and matcher.frame_xys:
        raise ValueError(f"block matcher for item {item_id} must not define frames")


def _validate_collisions(entries: Mapping[int, tuple[ItemMatcher, ...]]) -> None:
    block_owner: dict[int, int] = {}
    wall_owner: dict[int, int] = {}
    object_unframed_owner: dict[int, int] = {}
    for item_id, matchers in entries.items():
        for matcher in matchers:
            if matcher.category == "block" and matcher.tile_id is not None:
                _record_owner(block_owner, matcher.tile_id, item_id, "block tile_id")
            elif matcher.category == "wall":
                for wall_id in matcher.wall_ids:
                    _record_owner(wall_owner, wall_id, item_id, "wall_id")
            elif (
                matcher.category == "object"
                and matcher.tile_id is not None
                and not matcher.frame_xys
            ):
                _record_owner(
                    object_unframed_owner,
                    matcher.tile_id,
                    item_id,
                    "object tile_id (no frame)",
                )


def _record_owner(
    owner_map: dict[int, int],
    key: int,
    item_id: int,
    label: str,
) -> None:
    previous = owner_map.get(key)
    if previous is not None and previous != item_id:
        raise ValueError(
            f"item_world_map collision for {label}={key}: "
            f"items {previous} and {item_id}"
        )
    owner_map.setdefault(key, item_id)


def _parse_item_id(raw_item_id: str) -> int:
    if not raw_item_id.isdecimal():
        raise ValueError(f"item_id key must be decimal: {raw_item_id!r}")
    return int(raw_item_id)


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


def _is_int(value: object) -> TypeGuard[int]:
    return isinstance(value, int) and not isinstance(value, bool)
