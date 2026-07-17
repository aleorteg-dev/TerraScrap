"""Wiki scraper — fetches item data from wiki.gg and writes versioned cache."""

import asyncio
import json
import logging
from pathlib import Path
from typing import Protocol, TypedDict

import httpx
from bs4 import BeautifulSoup, Tag


class _ItemPatch(TypedDict, total=False):
    """Partial per-item fields parsed from the detail page infobox (IT-17, G07)."""

    sprite_url: str
    category: str
    rarity: int
    tooltip: str | None


class _ScrapedItem(TypedDict):
    """One item row as written to the versioned cache (IT-17, G07)."""

    id: int
    name: str
    sprite_url: str
    category: str
    rarity: int
    tooltip: str | None


_WIKI_BASE_URL = "https://terraria.wiki.gg"
_WIKI_ITEMS_URL = f"{_WIKI_BASE_URL}/wiki/Item_IDs"
_CACHE_SCHEMA: int = 2
_MAX_RETRIES: int = 3
_BACKOFF_SECONDS: tuple[float, ...] = (1.0, 2.0, 4.0)
# Paralelismo acotado del enrich (IT-OPT-6, P09): ~6k páginas una a una eran
# horas de CLI; 6 en vuelo mantiene la carga sobre wiki.gg moderada.
_ENRICH_CONCURRENCY: int = 6

_log = logging.getLogger(__name__)


class HttpClient(Protocol):
    async def get(self, url: str) -> httpx.Response: ...


class WikiUnavailableError(Exception):
    """Wiki unreachable: timeout exhausted or 5xx response."""


class WikiSchemaChangedError(Exception):
    """Expected HTML structure not found (selector failed)."""


async def _get_with_retry(client: HttpClient, url: str) -> httpx.Response:
    """Fetch URL with exponential backoff on timeouts (1s, 2s, 4s; 3 attempts max)."""
    last_exc: BaseException | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            return await client.get(url)
        except httpx.TransportError as exc:
            # httpx.TimeoutException is a TransportError subclass (M08's twin,
            # M07): a single except covers timeouts and connection errors.
            last_exc = exc
            backoff = _BACKOFF_SECONDS[attempt]
            _log.warning(
                "Wiki fetch timeout (attempt %d/%d) for %s; sleeping %ss",
                attempt + 1,
                _MAX_RETRIES,
                url,
                backoff,
            )
            if attempt + 1 < _MAX_RETRIES:
                await asyncio.sleep(backoff)
    raise WikiUnavailableError(
        f"Wiki timeout after {_MAX_RETRIES} attempts: {url}"
    ) from last_exc


async def refresh_cache_from_wiki(
    cache_path: Path,
    client: HttpClient,
    *,
    enrich: bool = False,
) -> None:
    """Fetch item list (and optionally per-item details) and persist as versioned JSON.

    - 5xx on list page → WikiUnavailableError, cache is NOT overwritten.
    - Table selector missing → WikiSchemaChangedError.
    - When enrich=True: per-item 404 → log + skip, item kept with empty fields;
      per-item 5xx → WikiUnavailableError (cache NOT written).
    """
    response = await _get_with_retry(client, _WIKI_ITEMS_URL)
    if 500 <= response.status_code < 600:
        raise WikiUnavailableError(
            f"Wiki returned {response.status_code} for {_WIKI_ITEMS_URL}"
        )
    response.raise_for_status()

    items, links = _parse_items_page(response.text)

    if enrich:
        await _enrich_items(items, links, client)

    payload: dict[str, object] = {
        "schema": _CACHE_SCHEMA,
        "version": _CACHE_SCHEMA,
        "items": items,
    }
    cache_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _find_items_table(soup: BeautifulSoup) -> Tag | None:
    """Find the main items table, tolerating wiki CSS class changes."""
    for cls in ("terraria", "wikitable"):
        table = soup.find("table", class_=cls)
        if isinstance(table, Tag):
            return table
    content = soup.find(id="mw-content-text")
    if isinstance(content, Tag):
        table = content.find("table")
        if isinstance(table, Tag):
            return table
    return None


def _parse_items_page(html: str) -> tuple[list[_ScrapedItem], dict[int, str]]:
    """Returns (items, link_map). Raises WikiSchemaChangedError if table missing."""
    soup = BeautifulSoup(html, "html.parser")
    table = _find_items_table(soup)
    if table is None:
        raise WikiSchemaChangedError(
            "Items table not found in wiki HTML (selector failed)"
        )

    items: list[_ScrapedItem] = []
    links: dict[int, str] = {}
    rows = table.find_all("tr")
    for row in rows[1:]:
        if not isinstance(row, Tag):
            continue
        cells = row.find_all("td")
        if len(cells) < 2:
            continue

        id_text = cells[0].get_text(strip=True)
        if not id_text.isdigit():
            continue
        item_id = int(id_text)

        name_cell = cells[1]
        link = name_cell.find("a")
        name = (
            link.get_text(strip=True)
            if isinstance(link, Tag)
            else name_cell.get_text(strip=True)
        )
        if not name:
            continue

        if isinstance(link, Tag):
            href = link.get("href")
            if isinstance(href, str) and href:
                links[item_id] = (
                    href if href.startswith("http") else f"{_WIKI_BASE_URL}{href}"
                )

        items.append(
            {
                "id": item_id,
                "name": name,
                "sprite_url": "",
                "category": "",
                "rarity": 0,
                "tooltip": None,
            }
        )

    return items, links


async def _enrich_items(
    items: list[_ScrapedItem],
    links: dict[int, str],
    client: HttpClient,
) -> None:
    """Enrich each item from its wiki page, _ENRICH_CONCURRENCY pages in flight.

    Semantics match the old sequential loop: 404 → warn + keep empty fields;
    the first 5xx aborts the whole run with WikiUnavailableError (the cache is
    never written). Per-request retry/backoff lives in _get_with_retry.
    """
    semaphore = asyncio.Semaphore(_ENRICH_CONCURRENCY)

    async def _enrich_one(entry: _ScrapedItem) -> None:
        item_id = int(entry["id"])
        url = links.get(item_id)
        if url is None:
            return
        async with semaphore:
            resp = await _get_with_retry(client, url)

        status = resp.status_code
        if status == 404:
            _log.warning("Item %d page 404 (%s); keeping empty fields", item_id, url)
            return
        if 500 <= status < 600:
            raise WikiUnavailableError(f"Wiki returned {status} for item page {url}")
        if status != 200:
            _log.warning("Item %d page status %d (%s); skipping", item_id, status, url)
            return

        details = _parse_item_detail(resp.text)
        if "sprite_url" in details:
            entry["sprite_url"] = details["sprite_url"]
        if "category" in details:
            entry["category"] = details["category"]
        if "rarity" in details:
            entry["rarity"] = details["rarity"]
        if "tooltip" in details:
            entry["tooltip"] = details["tooltip"]

    results = await asyncio.gather(
        *(_enrich_one(entry) for entry in items), return_exceptions=True
    )
    for result in results:
        if isinstance(result, BaseException):
            raise result


def _parse_item_detail(html: str) -> _ItemPatch:
    """Parse per-item infobox. Missing fields → defaults, never raise."""
    soup = BeautifulSoup(html, "html.parser")
    out: _ItemPatch = {}

    img = soup.select_one("img.item-sprite, .infobox img")
    if isinstance(img, Tag):
        src = img.get("src")
        if isinstance(src, str):
            out["sprite_url"] = (
                src if src.startswith("http") else f"{_WIKI_BASE_URL}{src}"
            )

    cat = soup.select_one(".item-category, [data-category]")
    if isinstance(cat, Tag):
        data_cat = cat.get("data-category")
        text = (
            data_cat
            if isinstance(data_cat, str) and data_cat
            else cat.get_text(strip=True)
        )
        if text:
            out["category"] = text

    rar = soup.select_one("[data-rarity]")
    if isinstance(rar, Tag):
        data_r = rar.get("data-rarity")
        if isinstance(data_r, str) and data_r.lstrip("-").isdigit():
            out["rarity"] = int(data_r)

    tt = soup.select_one(".item-tooltip, .tooltip")
    if isinstance(tt, Tag):
        text = tt.get_text(strip=True)
        if text:
            out["tooltip"] = text

    return out
