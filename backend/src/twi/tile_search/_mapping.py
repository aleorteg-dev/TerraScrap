"""Loading and validation for B4 item-to-world mappings.

Schema v3.0.0 (iter-13): legible per-entry list format inspired by item catalog.

Layout::

    {
      "schema_version": "3.0.0",
      "items": [
        {
          "item_id": 48,
          "item_name": "Chest",
          "matchers": [
            {
              "category": "object",
              "world_id": 21,
              "world_name": "Containers",
              "frame_xy": [0, 0]
            }
          ]
        }
      ]
    }

Per matcher:

- ``category``: ``"block"``, ``"wall"`` or ``"object"``.
- ``world_id`` (or ``world_ids`` for walls only): replaces v2 ``tile_id``/``wall_id``.
- Optional legibility fields: ``world_name``, ``world_internal_name``, ``item_id``,
  ``item_name``, ``sub_id``, ``safe`` (walls), ``source`` / ``source_url``.
- ``frame_xy`` / ``frame_xys`` only on ``object``.

``MappingStaleError`` raised when ``schema_version`` is missing/different.
The engine still consumes the same :class:`ItemMatcher` shape.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, TypeGuard, cast

WorldMapCategory = Literal["block", "wall", "object"]

SCHEMA_VERSION: Final[str] = "3.0.0"

_ROOT_KEYS: Final[frozenset[str]] = frozenset({"items", "schema_version"})
_ITEM_KEYS: Final[frozenset[str]] = frozenset({"item_id", "item_name", "matchers"})
_MATCHER_KEYS: Final[frozenset[str]] = frozenset(
    {
        "category",
        "world_id",
        "world_ids",
        "world_name",
        "world_internal_name",
        "item_id",
        "item_name",
        "frame_xy",
        "frame_xys",
        "sub_id",
        "safe",
        "source",
        "source_url",
    }
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

    raw_items = data.get("items")
    if not isinstance(raw_items, list):
        raise ValueError("item_world_map.items must be a list of item entries")

    entries: dict[int, tuple[ItemMatcher, ...]] = {}
    for index, raw_entry in enumerate(cast(list[object], raw_items)):
        item_id, matchers = _parse_item_entry(index, raw_entry)
        if item_id in entries:
            raise ValueError(f"duplicate item_id {item_id} in items list")
        entries[item_id] = matchers

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


def _parse_item_entry(
    index: int,
    raw: object,
) -> tuple[int, tuple[ItemMatcher, ...]]:
    entry = _as_str_object_map(raw, f"item_world_map.items[{index}]")
    unknown_keys = set(entry) - _ITEM_KEYS
    if unknown_keys:
        keys = ", ".join(sorted(unknown_keys))
        raise ValueError(f"item entry [{index}] has unknown keys: {keys}")

    raw_item_id = entry.get("item_id")
    if not _is_int(raw_item_id) or raw_item_id <= 0:
        raise ValueError(f"item entry [{index}] requires positive integer item_id")
    item_id = raw_item_id

    raw_item_name = entry.get("item_name")
    if not isinstance(raw_item_name, str) or not raw_item_name.strip():
        raise ValueError(f"item {item_id} requires non-empty item_name")

    raw_matchers = entry.get("matchers")
    if not isinstance(raw_matchers, list) or not raw_matchers:
        raise ValueError(f"item {item_id} requires non-empty matchers list")

    matchers_list = cast(list[object], raw_matchers)
    parsed = tuple(_parse_matcher(item_id, raw_item_name, m) for m in matchers_list)
    return item_id, parsed


def _parse_matcher(item_id: int, item_name: str, raw: object) -> ItemMatcher:
    entry = _as_str_object_map(raw, f"item {item_id} matcher")
    unknown_keys = set(entry) - _MATCHER_KEYS
    if unknown_keys:
        keys = ", ".join(sorted(unknown_keys))
        raise ValueError(f"item {item_id} matcher has unknown keys: {keys}")

    _validate_redundant_identity(item_id, item_name, entry)
    _validate_string_field(item_id, entry, "world_name")
    _validate_string_field(item_id, entry, "world_internal_name")
    _validate_string_field(item_id, entry, "source")
    _validate_string_field(item_id, entry, "source_url")
    _validate_int_field(item_id, entry, "sub_id")

    category_raw = entry.get("category")
    if category_raw not in _CATEGORIES:
        raise ValueError(
            f"item {item_id} matcher has invalid category: {category_raw!r}"
        )
    category = category_raw

    if category == "wall":
        if "frame_xy" in entry or "frame_xys" in entry:
            raise ValueError(f"wall matcher for item {item_id} must not define frames")
        if "safe" in entry and not isinstance(entry["safe"], bool):
            raise ValueError(f"item {item_id} matcher.safe must be boolean")
        return ItemMatcher(category="wall", wall_ids=_parse_wall_ids(item_id, entry))

    if "world_ids" in entry:
        raise ValueError(
            f"{category} matcher for item {item_id} must use world_id, not world_ids"
        )
    if "safe" in entry:
        raise ValueError(
            f"{category} matcher for item {item_id} must not define 'safe'"
        )
    tile_id = _required_int(entry, "world_id", item_id)

    if category == "block":
        if "frame_xy" in entry or "frame_xys" in entry:
            raise ValueError(f"block matcher for item {item_id} must not define frames")
        return ItemMatcher(category="block", tile_id=tile_id)

    return ItemMatcher(
        category="object",
        tile_id=tile_id,
        frame_xys=_parse_frames(item_id, entry),
    )


def _validate_redundant_identity(
    item_id: int,
    item_name: str,
    entry: Mapping[str, object],
) -> None:
    if "item_id" in entry:
        raw_id = entry["item_id"]
        if not _is_int(raw_id) or raw_id != item_id:
            raise ValueError(
                f"item {item_id} matcher.item_id={raw_id!r} does not match parent"
            )
    if "item_name" in entry:
        raw_name = entry["item_name"]
        if not isinstance(raw_name, str) or raw_name != item_name:
            raise ValueError(
                f"item {item_id} matcher.item_name={raw_name!r} does not match parent"
            )


def _validate_string_field(
    item_id: int,
    entry: Mapping[str, object],
    key: str,
) -> None:
    if key not in entry:
        return
    value = entry[key]
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"item {item_id} matcher.{key} must be a non-empty string")


def _validate_int_field(
    item_id: int,
    entry: Mapping[str, object],
    key: str,
) -> None:
    if key not in entry:
        return
    if not _is_int(entry[key]):
        raise ValueError(f"item {item_id} matcher.{key} must be an int")


def _parse_wall_ids(item_id: int, entry: Mapping[str, object]) -> tuple[int, ...]:
    has_single = "world_id" in entry
    has_many = "world_ids" in entry
    if has_single == has_many:
        raise ValueError(
            f"wall matcher for item {item_id} requires exactly one of "
            "world_id/world_ids"
        )
    if has_single:
        wall_id = entry["world_id"]
        if not _is_int(wall_id):
            raise ValueError(f"item {item_id} world_id must be an int")
        return (wall_id,)

    raw_list = entry["world_ids"]
    if not isinstance(raw_list, list) or not raw_list:
        raise ValueError(f"item {item_id} world_ids must be a non-empty list of int")
    items = cast(list[object], raw_list)
    parsed: list[int] = []
    for value in items:
        if not _is_int(value):
            raise ValueError(f"item {item_id} world_ids must be ints")
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
