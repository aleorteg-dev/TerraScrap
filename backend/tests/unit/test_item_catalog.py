"""Tests for B3 – item-catalog.

T-01  test_search_prefix_match_returns_item
T-02  test_search_is_case_insensitive
T-03  test_search_respects_limit
T-04  test_search_orders_prefix_before_substring
T-05  test_get_returns_item_detail
T-06  test_get_unknown_id_raises_ItemNotFoundError
T-07  test_create_catalog_from_cache_invalid_schema_raises
T-08  test_refresh_cache_writes_versioned_json
T-09  test_refresh_cache_parses_sample_wiki_html_page
T-10  test_load_catalog_uses_cache_when_present
T-11  test_load_catalog_falls_back_to_seed_and_logs_warning
T-12  test_load_catalog_raises_when_both_absent
T-13  test_load_catalog_falls_back_to_seed_when_cache_invalid_schema
T-14  test_load_catalog_raises_when_no_seed_and_cache_absent
T-15  test_search_numeric_returns_item_by_id
T-16  test_search_alpha_returns_by_name
T-17  test_search_zero_padded_id
T-18  test_search_unknown_id_returns_empty
T-19  test_search_empty_query_returns_empty
T-20  test_search_negative_or_overflow_falls_back_to_name
T-21  test_search_mixed_alphanumeric_uses_name_branch
T-22  test_refresh_cli_creates_output_parent_and_runs
"""

import json
import logging
import sys
from pathlib import Path

import httpx
import pytest

import twi.item_catalog.refresh as refresh_cli
import twi.item_catalog.scraper as scraper_mod
from twi.item_catalog import (
    ItemCatalog,
    ItemCatalogUnavailableError,
    ItemDetail,
    ItemNotFoundError,
    WikiSchemaChangedError,
    WikiUnavailableError,
    create_catalog_from_cache,
    load_catalog,
    refresh_cache_from_wiki,
)

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

_SAMPLE_ITEMS: list[dict[str, object]] = [
    {
        "id": 1,
        "name": "Copper Shortsword",
        "sprite_url": "https://example.com/copper.png",
        "category": "weapon",
        "rarity": 0,
        "tooltip": "Pretty weak, but better than nothing",
    },
    {
        "id": 4956,
        "name": "Zenith",
        "sprite_url": "https://example.com/zenith.png",
        "category": "weapon",
        "rarity": 10,
        "tooltip": "Forged from the legends of every era",
    },
    {
        "id": 521,
        "name": "Chlorophyte Ore",
        "sprite_url": "https://example.com/chlorophyte.png",
        "category": "material",
        "rarity": 4,
        "tooltip": None,
    },
    {
        "id": 3,
        "name": "Ore",
        "sprite_url": "https://example.com/ore.png",
        "category": "material",
        "rarity": 0,
        "tooltip": None,
    },
]

_VALID_CACHE: dict[str, object] = {"schema": 1, "items": _SAMPLE_ITEMS}


@pytest.fixture
def cache_file(tmp_path: Path) -> Path:
    p = tmp_path / "items.json"
    p.write_text(json.dumps(_VALID_CACHE), encoding="utf-8")
    return p


@pytest.fixture
def catalog(cache_file: Path) -> ItemCatalog:
    return create_catalog_from_cache(cache_file)


def _catalog_from_items(tmp_path: Path, items: list[dict[str, object]]) -> ItemCatalog:
    cache_path = tmp_path / "items.json"
    cache_path.write_text(
        json.dumps({"schema": 1, "items": items}),
        encoding="utf-8",
    )
    return create_catalog_from_cache(cache_path)


# ---------------------------------------------------------------------------
# T-01  prefix match
# ---------------------------------------------------------------------------


def test_search_prefix_match_returns_item(catalog: ItemCatalog) -> None:
    results = catalog.search("zen")
    assert any(r.name == "Zenith" for r in results)


def test_search_numeric_returns_item_by_id(catalog: ItemCatalog) -> None:
    results = catalog.search("4956")
    assert [(item.id, item.name) for item in results] == [(4956, "Zenith")]


def test_search_alpha_returns_by_name(catalog: ItemCatalog) -> None:
    results = catalog.search("zen")
    assert [(item.id, item.name) for item in results] == [(4956, "Zenith")]


def test_search_zero_padded_id(catalog: ItemCatalog) -> None:
    results = catalog.search("0001")
    assert [(item.id, item.name) for item in results] == [(1, "Copper Shortsword")]


def test_search_unknown_id_returns_empty(catalog: ItemCatalog) -> None:
    assert catalog.search("999999") == []


def test_search_empty_query_returns_empty(catalog: ItemCatalog) -> None:
    assert catalog.search("") == []
    assert catalog.search("   ") == []


def test_search_negative_or_overflow_falls_back_to_name(tmp_path: Path) -> None:
    catalog = _catalog_from_items(
        tmp_path,
        [
            {
                "id": 7,
                "name": "-1",
                "sprite_url": "https://example.com/negative.png",
                "category": "debug",
                "rarity": 0,
                "tooltip": None,
            },
            {
                "id": 8,
                "name": "99999999999999999999",
                "sprite_url": "https://example.com/overflow.png",
                "category": "debug",
                "rarity": 0,
                "tooltip": None,
            },
        ],
    )

    assert [(item.id, item.name) for item in catalog.search("-1")] == [(7, "-1")]
    assert [
        (item.id, item.name) for item in catalog.search("99999999999999999999")
    ] == [(8, "99999999999999999999")]


def test_search_mixed_alphanumeric_uses_name_branch(tmp_path: Path) -> None:
    catalog = _catalog_from_items(
        tmp_path,
        [
            {
                "id": 9,
                "name": "4956a",
                "sprite_url": "https://example.com/mixed.png",
                "category": "debug",
                "rarity": 0,
                "tooltip": None,
            }
        ],
    )

    assert [(item.id, item.name) for item in catalog.search("4956a")] == [(9, "4956a")]


# ---------------------------------------------------------------------------
# T-02  case-insensitive
# ---------------------------------------------------------------------------


def test_search_is_case_insensitive(catalog: ItemCatalog) -> None:
    lower = catalog.search("zenith")
    upper = catalog.search("ZENITH")
    assert [r.id for r in lower] == [r.id for r in upper]


# ---------------------------------------------------------------------------
# T-03  limit respected
# ---------------------------------------------------------------------------


def test_search_respects_limit(catalog: ItemCatalog) -> None:
    results = catalog.search("o", limit=2)
    assert len(results) <= 2


# ---------------------------------------------------------------------------
# T-04  prefix beats substring in ranking
# ---------------------------------------------------------------------------


def test_search_orders_prefix_before_substring(catalog: ItemCatalog) -> None:
    # "Ore" (id=3) starts with "ore" → prefix rank.
    # "Chlorophyte Ore" (id=521) contains "ore" as suffix → substring rank.
    results = catalog.search("ore")
    ids = [r.id for r in results]
    assert ids.index(3) < ids.index(521)


# ---------------------------------------------------------------------------
# T-05  get returns ItemDetail
# ---------------------------------------------------------------------------


def test_get_returns_item_detail(catalog: ItemCatalog) -> None:
    item = catalog.get(4956)
    assert isinstance(item, ItemDetail)
    assert item.name == "Zenith"
    assert item.rarity == 10


# ---------------------------------------------------------------------------
# T-06  get unknown id raises ItemNotFoundError
# ---------------------------------------------------------------------------


def test_get_unknown_id_raises_item_not_found_error(catalog: ItemCatalog) -> None:
    with pytest.raises(ItemNotFoundError):
        catalog.get(99999)


# ---------------------------------------------------------------------------
# T-07  bad schema raises ValueError
# ---------------------------------------------------------------------------


def test_create_catalog_from_cache_invalid_schema_raises(tmp_path: Path) -> None:
    bad = tmp_path / "items.json"
    bad.write_text(json.dumps({"schema": 999, "items": []}), encoding="utf-8")
    with pytest.raises(ValueError):
        create_catalog_from_cache(bad)


# ---------------------------------------------------------------------------
# T-08  refresh_cache writes versioned JSON (mocked client)
# ---------------------------------------------------------------------------


class _FakeHttpClient:
    def __init__(self, html: str) -> None:
        self._html = html

    async def get(self, url: str) -> httpx.Response:
        request = httpx.Request("GET", url)
        return httpx.Response(200, text=self._html, request=request)


_FIXTURE_HTML = Path(__file__).parent.parent / "fixtures" / "sample_wiki_items.html"


async def test_refresh_cache_writes_versioned_json(tmp_path: Path) -> None:
    html = _FIXTURE_HTML.read_text(encoding="utf-8")
    cache_path = tmp_path / "items.json"

    await refresh_cache_from_wiki(cache_path, _FakeHttpClient(html))

    data: dict[str, object] = json.loads(cache_path.read_text(encoding="utf-8"))
    assert data["schema"] == 2
    assert isinstance(data["items"], list)


# ---------------------------------------------------------------------------
# T-09  refresh_cache parses fixture HTML correctly
# ---------------------------------------------------------------------------


async def test_refresh_cache_parses_sample_wiki_html_page(tmp_path: Path) -> None:
    html = _FIXTURE_HTML.read_text(encoding="utf-8")
    cache_path = tmp_path / "items.json"

    await refresh_cache_from_wiki(cache_path, _FakeHttpClient(html))

    data: dict[str, object] = json.loads(cache_path.read_text(encoding="utf-8"))
    items = data["items"]
    assert isinstance(items, list)
    items_by_id = {int(item["id"]): item for item in items}  # type: ignore[index]

    assert 1 in items_by_id, "Iron Pickaxe (id=1) should be parsed"
    assert items_by_id[1]["name"] == "Iron Pickaxe"

    assert 4956 in items_by_id, "Zenith (id=4956) should be parsed"
    assert items_by_id[4956]["name"] == "Zenith"

    assert 99 not in items_by_id, "non-numeric ID row must be skipped"


def test_refresh_cli_creates_output_parent_and_runs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    output = tmp_path / "nested" / "items.json"
    calls: list[Path] = []

    async def fake_run(path: Path, *, enrich: bool = False) -> None:
        calls.append(path)

    monkeypatch.setattr(refresh_cli, "_run", fake_run)
    monkeypatch.setattr(
        sys,
        "argv",
        ["python -m twi.item_catalog.refresh", "--output", str(output)],
    )

    refresh_cli.main()

    assert output.parent.is_dir()
    assert calls == [output]


def test_refresh_cli_passes_enrich_flag(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    output = tmp_path / "items.json"
    calls: list[tuple[Path, bool]] = []

    async def fake_run(path: Path, *, enrich: bool = False) -> None:
        calls.append((path, enrich))

    monkeypatch.setattr(refresh_cli, "_run", fake_run)
    monkeypatch.setattr(
        sys,
        "argv",
        ["python -m twi.item_catalog.refresh", "--output", str(output), "--enrich"],
    )

    refresh_cli.main()

    assert calls == [(output, True)]


def test_refresh_cli_exits_nonzero_when_wiki_refresh_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    output = tmp_path / "items.json"

    async def fake_run(path: Path, *, enrich: bool = False) -> None:
        raise WikiUnavailableError("wiki down")

    monkeypatch.setattr(refresh_cli, "_run", fake_run)
    monkeypatch.setattr(
        sys,
        "argv",
        ["python -m twi.item_catalog.refresh", "--output", str(output)],
    )

    with pytest.raises(SystemExit) as exc_info:
        refresh_cli.main()

    assert exc_info.value.code == 1
    assert not output.exists()


async def test_refresh_run_uses_http_client_and_logs_written_count(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    output = tmp_path / "items.json"
    calls: list[tuple[Path, object, bool]] = []

    class FakeAsyncClient:
        def __init__(self, **kwargs: object) -> None:
            self.kwargs = kwargs

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

    async def fake_refresh(path: Path, client: object, *, enrich: bool = False) -> None:
        calls.append((path, client, enrich))
        path.write_text(
            json.dumps({"schema": 1, "items": [{"id": 1, "name": "Item"}]}),
            encoding="utf-8",
        )

    monkeypatch.setattr(refresh_cli.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(refresh_cli, "refresh_cache_from_wiki", fake_refresh)

    with caplog.at_level(logging.INFO):
        await refresh_cli._run(output, enrich=True)

    assert len(calls) == 1
    assert calls[0][0] == output
    assert calls[0][2] is True
    assert isinstance(calls[0][1], FakeAsyncClient)
    assert "Written 1 items" in caplog.text


# ---------------------------------------------------------------------------
# T-10  load_catalog uses cache when present
# ---------------------------------------------------------------------------


def test_load_catalog_uses_cache_when_present(tmp_path: Path) -> None:
    cache = tmp_path / "items.json"
    cache.write_text(json.dumps(_VALID_CACHE), encoding="utf-8")
    catalog = load_catalog(cache)
    assert catalog.get(4956).name == "Zenith"


# ---------------------------------------------------------------------------
# T-11  load_catalog falls back to seed when cache absent, logs warning
# ---------------------------------------------------------------------------


def test_load_catalog_falls_back_to_seed_and_logs_warning(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    seed = tmp_path / "seed.json"
    seed.write_text(json.dumps(_VALID_CACHE), encoding="utf-8")
    with caplog.at_level(logging.WARNING):
        catalog = load_catalog(tmp_path / "cache.json", seed_path=seed)
    assert catalog.get(4956).name == "Zenith"
    assert len(caplog.records) >= 1


# ---------------------------------------------------------------------------
# T-12  load_catalog raises ItemCatalogUnavailableError when both absent
# ---------------------------------------------------------------------------


def test_load_catalog_raises_when_both_absent(tmp_path: Path) -> None:
    with pytest.raises(ItemCatalogUnavailableError):
        load_catalog(tmp_path / "cache.json", seed_path=tmp_path / "seed.json")


# ---------------------------------------------------------------------------
# T-13  load_catalog falls back to seed when cache has invalid schema
# ---------------------------------------------------------------------------


def test_load_catalog_falls_back_to_seed_when_cache_invalid_schema(
    tmp_path: Path,
) -> None:
    cache = tmp_path / "cache.json"
    cache.write_text(json.dumps({"schema": 99, "items": []}), encoding="utf-8")
    seed = tmp_path / "seed.json"
    seed.write_text(json.dumps(_VALID_CACHE), encoding="utf-8")
    catalog = load_catalog(cache, seed_path=seed)
    assert catalog.get(4956).name == "Zenith"


# ---------------------------------------------------------------------------
# T-14  load_catalog raises when no seed_path and cache absent
# ---------------------------------------------------------------------------


def test_load_catalog_raises_when_no_seed_and_cache_absent(tmp_path: Path) -> None:
    with pytest.raises(ItemCatalogUnavailableError):
        load_catalog(tmp_path / "nonexistent.json")


# ---------------------------------------------------------------------------
# T-23..T-30  Iter-13 hardening: retry, error classes, enrichment, versioning.
# ---------------------------------------------------------------------------


_LIST_HTML = """\
<html><body>
<table class="terraria">
<tr><th>ID</th><th>Name</th></tr>
<tr><td>1</td><td><a href="/wiki/Iron_Pickaxe">Iron Pickaxe</a></td></tr>
<tr><td>4956</td><td><a href="/wiki/Zenith">Zenith</a></td></tr>
</table></body></html>
"""

_DETAIL_HTML = """\
<html><body>
<div class="infobox">
  <img class="item-sprite" src="/images/Zenith.png" />
  <div class="item-category" data-category="weapon">Weapon</div>
  <div data-rarity="10">Rarity 10</div>
  <div class="item-tooltip">Forged from the legends of every era</div>
</div>
</body></html>
"""


class _RoutedClient:
    """Mock HttpClient that returns canned responses per URL."""

    def __init__(
        self,
        routes: dict[str, httpx.Response | Exception],
        *,
        record: list[str] | None = None,
    ) -> None:
        self._routes = routes
        self._record = record if record is not None else []

    async def get(self, url: str) -> httpx.Response:
        self._record.append(url)
        result = self._routes.get(url)
        if result is None:
            raise AssertionError(f"Unexpected URL fetched in test: {url}")
        if isinstance(result, Exception):
            raise result
        return result


def _resp(status: int, text: str = "") -> httpx.Response:
    return httpx.Response(status, text=text, request=httpx.Request("GET", "http://t"))


# T-23  scraper enriches catalog with sprite_url/category/rarity/tooltip.
async def test_scraper_enriches_items_with_extended_fields(tmp_path: Path) -> None:
    routes: dict[str, httpx.Response | Exception] = {
        "https://terraria.wiki.gg/wiki/Item_IDs": _resp(200, _LIST_HTML),
        "https://terraria.wiki.gg/wiki/Iron_Pickaxe": _resp(200, _DETAIL_HTML),
        "https://terraria.wiki.gg/wiki/Zenith": _resp(200, _DETAIL_HTML),
    }
    cache_path = tmp_path / "items.json"
    await refresh_cache_from_wiki(cache_path, _RoutedClient(routes), enrich=True)

    catalog = create_catalog_from_cache(cache_path)
    zen = catalog.get(4956)
    assert zen.sprite_url.endswith("/images/Zenith.png")
    assert zen.category == "weapon"
    assert zen.rarity == 10
    assert zen.tooltip == "Forged from the legends of every era"


# T-24  timeout retried 3 times → WikiUnavailableError.
async def test_scraper_timeout_retries_then_raises_unavailable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sleeps: list[float] = []

    async def fake_sleep(s: float) -> None:
        sleeps.append(s)

    monkeypatch.setattr(scraper_mod.asyncio, "sleep", fake_sleep)

    record: list[str] = []
    timeout = httpx.TimeoutException("boom")
    routes: dict[str, httpx.Response | Exception] = {
        "https://terraria.wiki.gg/wiki/Item_IDs": timeout,
    }
    cache_path = tmp_path / "items.json"
    with pytest.raises(WikiUnavailableError):
        await refresh_cache_from_wiki(cache_path, _RoutedClient(routes, record=record))

    assert record.count("https://terraria.wiki.gg/wiki/Item_IDs") == 3
    assert sleeps == [1.0, 2.0]
    assert not cache_path.exists()


# T-25  per-item 404 → log + skip, refresh completes; cache written.
async def test_scraper_per_item_404_skips_and_continues(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    routes: dict[str, httpx.Response | Exception] = {
        "https://terraria.wiki.gg/wiki/Item_IDs": _resp(200, _LIST_HTML),
        "https://terraria.wiki.gg/wiki/Iron_Pickaxe": _resp(404, ""),
        "https://terraria.wiki.gg/wiki/Zenith": _resp(200, _DETAIL_HTML),
    }
    cache_path = tmp_path / "items.json"
    with caplog.at_level(logging.WARNING):
        await refresh_cache_from_wiki(cache_path, _RoutedClient(routes), enrich=True)

    catalog = create_catalog_from_cache(cache_path)
    pickaxe = catalog.get(1)
    assert pickaxe.sprite_url == ""
    zen = catalog.get(4956)
    assert zen.category == "weapon"
    assert any("404" in rec.getMessage() for rec in caplog.records)


# T-26  5xx on list → WikiUnavailableError, cache NOT overwritten.
async def test_scraper_5xx_raises_unavailable_does_not_write_cache(
    tmp_path: Path,
) -> None:
    cache_path = tmp_path / "items.json"
    pre_existing = '{"schema": 1, "items": []}'
    cache_path.write_text(pre_existing, encoding="utf-8")

    routes: dict[str, httpx.Response | Exception] = {
        "https://terraria.wiki.gg/wiki/Item_IDs": _resp(503, ""),
    }
    with pytest.raises(WikiUnavailableError):
        await refresh_cache_from_wiki(cache_path, _RoutedClient(routes))

    assert cache_path.read_text(encoding="utf-8") == pre_existing


# T-27  selector failure → WikiSchemaChangedError.
async def test_scraper_table_missing_raises_schema_changed(tmp_path: Path) -> None:
    routes: dict[str, httpx.Response | Exception] = {
        "https://terraria.wiki.gg/wiki/Item_IDs": _resp(
            200, "<html><body><p>no table here</p></body></html>"
        ),
    }
    cache_path = tmp_path / "items.json"
    with pytest.raises(WikiSchemaChangedError):
        await refresh_cache_from_wiki(cache_path, _RoutedClient(routes))
    assert not cache_path.exists()


# T-28  load_catalog falls back to seed when scraping fails.
async def test_load_catalog_uses_seed_when_scraping_fails(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    cache_path = tmp_path / "cache.json"
    seed_path = tmp_path / "seed.json"
    seed_path.write_text(json.dumps(_VALID_CACHE), encoding="utf-8")

    routes: dict[str, httpx.Response | Exception] = {
        "https://terraria.wiki.gg/wiki/Item_IDs": _resp(503, ""),
    }
    with pytest.raises(WikiUnavailableError):
        await refresh_cache_from_wiki(cache_path, _RoutedClient(routes))

    with caplog.at_level(logging.WARNING):
        catalog = load_catalog(cache_path, seed_path=seed_path)
    assert catalog.get(4956).name == "Zenith"


# T-29  refresh writes versioned filename and version field.
async def test_refresh_writes_versioned_seed_file(tmp_path: Path) -> None:
    output = tmp_path / "items_seed.v2.json"
    routes: dict[str, httpx.Response | Exception] = {
        "https://terraria.wiki.gg/wiki/Item_IDs": _resp(200, _LIST_HTML),
    }
    await refresh_cache_from_wiki(output, _RoutedClient(routes))

    assert output.name == "items_seed.v2.json"
    data: dict[str, object] = json.loads(output.read_text(encoding="utf-8"))
    assert data["schema"] == 2
    assert data["version"] == 2


# T-30  bundled v2 seed loads cleanly via load_catalog.
def test_bundled_v2_seed_loads(tmp_path: Path) -> None:
    bundled = Path(refresh_cli.__file__).parent / "data" / "items_seed.v2.json"
    assert bundled.exists(), "bundled v2 seed must ship with the package"
    catalog = load_catalog(tmp_path / "absent.json", seed_path=bundled)
    zen = catalog.get(4956)
    assert zen.name == "Zenith"
    assert zen.sprite_url != ""
