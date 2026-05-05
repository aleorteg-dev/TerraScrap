"""In-memory item catalog — domain logic, no FastAPI dependency."""

import json
import logging
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

_logger = logging.getLogger(__name__)

_SUPPORTED_SCHEMA: int = 1


@dataclass(frozen=True)
class ItemSummary:
    id: int
    name: str
    sprite_url: str
    category: str


@dataclass(frozen=True)
class ItemDetail(ItemSummary):
    rarity: int
    tooltip: str | None


class ItemNotFoundError(Exception):
    def __init__(self, item_id: int) -> None:
        super().__init__(f"Item {item_id} not found in catalog")
        self.item_id = item_id


class ItemCatalog(Protocol):
    def search(self, query: str, limit: int = 20) -> list[ItemSummary]: ...
    def get(self, item_id: int) -> ItemDetail: ...


def _normalize(text: str) -> str:
    """Lowercase + diacritic-strip (SP-07)."""
    return (
        unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    )


def _parse_id(query: str) -> int | None:
    try:
        item_id = int(query)
    except (ValueError, OverflowError):
        return None

    if item_id <= 0 or item_id > sys.maxsize:
        return None
    return item_id


class _InMemoryItemCatalog:
    def __init__(self, items: list[ItemDetail]) -> None:
        self._by_id: dict[int, ItemDetail] = {item.id: item for item in items}
        self._index: list[tuple[str, ItemSummary]] = [
            (_normalize(item.name), item) for item in items
        ]

    def search(self, query: str, limit: int = 20) -> list[ItemSummary]:
        q = query.strip()
        if not q:
            return []

        item_id = _parse_id(q)
        if item_id is not None:
            return self._search_by_id(item_id)

        return self._search_by_name(q, limit)

    def _search_by_id(self, item_id: int) -> list[ItemSummary]:
        item = self._by_id.get(item_id)
        if item is None:
            return []
        return [item]

    def _search_by_name(self, query: str, limit: int) -> list[ItemSummary]:
        q = _normalize(query)
        prefixes: list[ItemSummary] = []
        substrings: list[ItemSummary] = []
        for norm_name, summary in self._index:
            if q in norm_name:
                if norm_name.startswith(q):
                    prefixes.append(summary)
                else:
                    substrings.append(summary)
        prefixes.sort(key=lambda s: s.id)
        substrings.sort(key=lambda s: s.id)
        return (prefixes + substrings)[:limit]

    def get(self, item_id: int) -> ItemDetail:
        try:
            return self._by_id[item_id]
        except KeyError:
            raise ItemNotFoundError(item_id) from None


def create_catalog_from_cache(cache_path: Path) -> ItemCatalog:
    """Load an ItemCatalog from a versioned JSON cache file.

    Raises FileNotFoundError if the file is absent.
    Raises ValueError if the schema version is unsupported.
    """
    data: dict[str, Any] = json.loads(cache_path.read_text(encoding="utf-8"))
    if data.get("schema") != _SUPPORTED_SCHEMA:
        raise ValueError(
            f"Unsupported cache schema {data.get('schema')!r}; "
            f"expected {_SUPPORTED_SCHEMA}"
        )
    items = [
        ItemDetail(
            id=int(entry["id"]),
            name=str(entry["name"]),
            sprite_url=str(entry["sprite_url"]),
            category=str(entry["category"]),
            rarity=int(entry["rarity"]),
            tooltip=str(entry["tooltip"]) if entry.get("tooltip") else None,
        )
        for entry in data["items"]
    ]
    return _InMemoryItemCatalog(items)


class ItemCatalogUnavailableError(Exception):
    """Raised when neither cache nor seed catalog can be loaded."""


def load_catalog(
    cache_path: Path,
    seed_path: Path | None = None,
) -> ItemCatalog:
    """Load catalog with fallback: cache_path → seed_path → ItemCatalogUnavailableError.

    Logs WARNING when falling back to seed.
    """
    try:
        return create_catalog_from_cache(cache_path)
    except (FileNotFoundError, ValueError):
        pass

    if seed_path is not None:
        try:
            catalog = create_catalog_from_cache(seed_path)
            _logger.warning(
                "Item cache absent/invalid at %s; serving bundled seed catalog.",
                cache_path,
            )
            return catalog
        except (FileNotFoundError, ValueError):
            pass

    raise ItemCatalogUnavailableError(
        f"No item catalog source available (cache={cache_path!r}, seed={seed_path!r})"
    )
