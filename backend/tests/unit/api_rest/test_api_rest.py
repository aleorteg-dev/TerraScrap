"""Tests for B5 – api-rest (T-01 … T-13)."""

from __future__ import annotations

import base64
import json
import struct as _struct
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from twi.api_rest.router import create_router
from twi.item_catalog import ItemCatalog, ItemDetail, ItemNotFoundError, ItemSummary
from twi.tile_search import SearchMatch, SearchResult, TileSearchEngine
from twi.wld_parser import (
    Tile,
    TileGrid,
    UnsupportedWorldVersionError,
    WldParseError,
    World,
    WorldMetadata,
)
from twi.world_repository import WorldNotFoundError, WorldRepository

# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _FakeRepo:
    def __init__(self) -> None:
        self._worlds: dict[str, World] = {}
        self._counter = 0

    def store(self, world: World) -> str:
        self._counter += 1
        wid = f"world-{self._counter}"
        self._worlds[wid] = world
        return wid

    def get(self, world_id: str) -> World:
        try:
            return self._worlds[world_id]
        except KeyError:
            raise WorldNotFoundError(world_id) from None

    def delete(self, world_id: str) -> None:
        self._worlds.pop(world_id, None)

    def touch(self, world_id: str) -> None:
        if world_id not in self._worlds:
            raise WorldNotFoundError(world_id)

    def purge_expired(self, now: datetime | None = None) -> int:
        return 0


class _FakeCatalog:
    def __init__(self, items: list[ItemDetail]) -> None:
        self._items = items

    def search(self, query: str, limit: int = 20) -> list[ItemSummary]:
        q = query.lower()
        result: list[ItemSummary] = []
        for item in self._items:
            if q in item.name.lower():
                result.append(item)
        return result[:limit]

    def get(self, item_id: int) -> ItemDetail:
        for item in self._items:
            if item.id == item_id:
                return item
        raise ItemNotFoundError(item_id)


class _FakeSearch:
    def __init__(self, result: SearchResult) -> None:
        self._result = result

    def search(
        self,
        world: World,
        item_id: int,
        include_containers: bool = True,
    ) -> SearchResult:
        return self._result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_world(name: str = "Test") -> World:
    tile = Tile(tile_id=None, wall_id=None, liquid=0, flags=0)
    grid = TileGrid([[tile]])
    meta = WorldMetadata(
        name=name,
        width=1,
        height=1,
        version=279,
        seed="12345",
        size="small",
        hardmode=False,
    )
    return World(metadata=meta, tiles=grid, chests=(), signs=())


def _parser_ok(data: bytes) -> World:
    return _make_world()


def _parser_invalid(data: bytes) -> World:
    raise WldParseError("bad magic")


def _parser_unsupported(data: bytes) -> World:
    raise UnsupportedWorldVersionError(100)


_CATALOG_ITEMS: list[ItemDetail] = [
    ItemDetail(
        id=757,
        name="Zenith",
        sprite_url="https://example.com/zenith.png",
        category="weapon",
        rarity=10,
        tooltip="The ultimate sword",
    ),
    ItemDetail(
        id=1,
        name="Iron Pickaxe",
        sprite_url="https://example.com/pick.png",
        category="tool",
        rarity=0,
        tooltip=None,
    ),
]

_SEARCH_RESULT = SearchResult(
    item_id=757,
    total=1,
    matches=(SearchMatch(x=10, y=20, source="chest", chest_id=3, stack=1),),
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def repo() -> _FakeRepo:
    return _FakeRepo()


@pytest.fixture()
def catalog() -> _FakeCatalog:
    return _FakeCatalog(_CATALOG_ITEMS)


@pytest.fixture()
def search_engine() -> _FakeSearch:
    return _FakeSearch(_SEARCH_RESULT)


def _make_client(
    repo: WorldRepository,
    catalog: ItemCatalog,
    search: TileSearchEngine,
    parser: Callable[[bytes], World] = _parser_ok,
    max_upload_mb: int = 200,
) -> TestClient:
    app = FastAPI()
    router = create_router(
        repo=repo,
        catalog=catalog,
        search=search,
        parser=parser,
        max_upload_mb=max_upload_mb,
    )
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture()
def client(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> TestClient:
    return _make_client(repo, catalog, search_engine)


# ---------------------------------------------------------------------------
# T-01 – POST /api/worlds returns world_id + metadata
# ---------------------------------------------------------------------------


def test_post_world_returns_world_id_and_metadata(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    client = _make_client(repo, catalog, search_engine, parser=_parser_ok)
    response = client.post(
        "/api/worlds",
        files={"file": ("world.wld", b"valid", "application/octet-stream")},
    )
    assert response.status_code == 200
    body = response.json()
    assert "world_id" in body
    meta = body["metadata"]
    assert meta["name"] == "Test"
    assert meta["width"] == 1
    assert meta["height"] == 1
    assert meta["version"] == 279
    assert meta["size"] == "small"
    assert meta["hardmode"] is False


# ---------------------------------------------------------------------------
# T-02 – POST /api/worlds with file > limit returns 413
# ---------------------------------------------------------------------------


def test_post_world_too_large_returns_413(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    client = _make_client(repo, catalog, search_engine, max_upload_mb=0)
    response = client.post(
        "/api/worlds",
        files={"file": ("world.wld", b"x", "application/octet-stream")},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"


# ---------------------------------------------------------------------------
# T-03 – POST /api/worlds with invalid bytes returns 400
# ---------------------------------------------------------------------------


def test_post_world_invalid_bytes_returns_400(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    client = _make_client(repo, catalog, search_engine, parser=_parser_invalid)
    response = client.post(
        "/api/worlds",
        files={"file": ("world.wld", b"notawld", "application/octet-stream")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_wld"


# ---------------------------------------------------------------------------
# T-04 – POST /api/worlds with unsupported version returns 422
# ---------------------------------------------------------------------------


def test_post_world_unsupported_version_returns_422(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    client = _make_client(repo, catalog, search_engine, parser=_parser_unsupported)
    response = client.post(
        "/api/worlds",
        files={"file": ("world.wld", b"anydata", "application/octet-stream")},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "unsupported_version"
    assert body["error"]["details"]["version"] == 100


# ---------------------------------------------------------------------------
# T-05 – GET /api/worlds/{id} unknown returns 404
# ---------------------------------------------------------------------------


def test_get_world_unknown_id_returns_404(client: TestClient) -> None:
    response = client.get("/api/worlds/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "world_not_found"


# ---------------------------------------------------------------------------
# T-06 – GET /api/worlds/{id}/search returns SearchResultDto
# ---------------------------------------------------------------------------


def test_search_endpoint_returns_matches(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    client = _make_client(repo, catalog, search_engine, parser=_parser_ok)
    upload = client.post(
        "/api/worlds",
        files={"file": ("world.wld", b"valid", "application/octet-stream")},
    )
    world_id = upload.json()["world_id"]

    response = client.get(f"/api/worlds/{world_id}/search", params={"item_id": 757})
    assert response.status_code == 200
    body = response.json()
    assert body["item_id"] == 757
    assert body["total"] == 1
    assert body["matches"][0]["source"] == "chest"
    assert body["matches"][0]["chest_id"] == 3


# ---------------------------------------------------------------------------
# T-07 – GET /api/worlds/{id}/search without item_id returns 400
# ---------------------------------------------------------------------------


def test_search_endpoint_missing_item_id_returns_400(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    client = _make_client(repo, catalog, search_engine, parser=_parser_ok)
    upload = client.post(
        "/api/worlds",
        files={"file": ("world.wld", b"valid", "application/octet-stream")},
    )
    world_id = upload.json()["world_id"]

    response = client.get(f"/api/worlds/{world_id}/search")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_item_id"


# ---------------------------------------------------------------------------
# T-08 – GET /api/items?q= returns up to limit results
# ---------------------------------------------------------------------------


def test_items_search_endpoint_returns_limited_results(
    client: TestClient,
) -> None:
    response = client.get("/api/items", params={"q": "zen", "limit": 5})
    assert response.status_code == 200
    body = response.json()
    assert "items" in body
    assert len(body["items"]) <= 5
    assert body["items"][0]["id"] == 757
    assert body["items"][0]["name"] == "Zenith"


# ---------------------------------------------------------------------------
# T-09 – DELETE /api/worlds/{id} returns 204
# ---------------------------------------------------------------------------


def test_delete_world_returns_204(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    client = _make_client(repo, catalog, search_engine, parser=_parser_ok)
    upload = client.post(
        "/api/worlds",
        files={"file": ("world.wld", b"valid", "application/octet-stream")},
    )
    world_id = upload.json()["world_id"]

    response = client.delete(f"/api/worlds/{world_id}")
    assert response.status_code == 204


# ---------------------------------------------------------------------------
# T-10 – DELETE /api/worlds/{id} unknown returns 404
# ---------------------------------------------------------------------------


def test_delete_world_unknown_id_returns_404(client: TestClient) -> None:
    response = client.delete("/api/worlds/ghost-id")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "world_not_found"


# ---------------------------------------------------------------------------
# T-11 – Every response includes X-API-Version header
# ---------------------------------------------------------------------------


def test_every_response_includes_api_version_header(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    client = _make_client(repo, catalog, search_engine, parser=_parser_ok)

    r_upload = client.post(
        "/api/worlds",
        files={"file": ("world.wld", b"valid", "application/octet-stream")},
    )
    assert r_upload.headers.get("x-api-version") == "v0.1.0"

    world_id = r_upload.json()["world_id"]

    r_get_meta = client.get(f"/api/worlds/{world_id}")
    assert r_get_meta.headers.get("x-api-version") == "v0.1.0"

    r_404 = client.get("/api/worlds/nonexistent")
    assert r_404.headers.get("x-api-version") == "v0.1.0"

    r_search_400 = client.get(f"/api/worlds/{world_id}/search")
    assert r_search_400.headers.get("x-api-version") == "v0.1.0"

    r_items = client.get("/api/items", params={"q": ""})
    assert r_items.headers.get("x-api-version") == "v0.1.0"

    r_delete = client.delete(f"/api/worlds/{world_id}")
    assert r_delete.headers.get("x-api-version") == "v0.1.0"


# ---------------------------------------------------------------------------
# T-12 – OpenAPI schema snapshot
# ---------------------------------------------------------------------------


def test_openapi_schema_snapshot(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    client = _make_client(repo, catalog, search_engine)
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()

    snapshot_path = Path(__file__).parent / "openapi_snapshot.json"
    if not snapshot_path.exists():
        snapshot_path.write_text(json.dumps(schema, indent=2))
        pytest.skip("Snapshot created; re-run to validate.")

    expected = json.loads(snapshot_path.read_text())
    assert schema == expected


# ---------------------------------------------------------------------------
# T-13 – GET /api/worlds/{id}/tiles payload decodes as row-major int16 RLE
# ---------------------------------------------------------------------------


def test_get_tiles_payload_encodes_row_major_int16_rle() -> None:
    """Payload must be base64( runs of (tileId:int16LE, count:uint16LE) ),
    in row-major order (y outer, x inner), with -1 for air (None tile_id).

    Grid layout (width=2, height=2):
        (x=0,y=0)=tile_id 5   (x=1,y=0)=tile_id 7
        (x=0,y=1)=air(-1)     (x=1,y=1)=air(-1)

    Expected flat row-major sequence: [5, 7, -1, -1]
    """
    t5 = Tile(tile_id=5, wall_id=None, liquid=0, flags=0)
    t7 = Tile(tile_id=7, wall_id=None, liquid=0, flags=0)
    air = Tile(tile_id=None, wall_id=None, liquid=0, flags=0)
    grid = TileGrid([[t5, air], [t7, air]])
    meta = WorldMetadata(
        name="T",
        width=2,
        height=2,
        version=269,
        seed="0",
        size="small",
        hardmode=False,
    )
    world = World(metadata=meta, tiles=grid, chests=(), signs=())

    repo = _FakeRepo()
    world_id = repo.store(world)
    client = _make_client(repo, _FakeCatalog([]), _FakeSearch(_SEARCH_RESULT))

    resp = client.get(
        f"/api/worlds/{world_id}/tiles",
        params={"chunk_x": 0, "chunk_y": 0, "chunk_size": 2},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["encoding"] == "base64-rle-v1"
    assert body["width"] == 2
    assert body["height"] == 2

    raw = base64.b64decode(body["payload"])
    # Each run is 4 bytes: int16LE tileId + uint16LE count.
    assert len(raw) % 4 == 0

    flat: list[int] = []
    for i in range(0, len(raw), 4):
        tid = _struct.unpack_from("<h", raw, i)[0]
        cnt = _struct.unpack_from("<H", raw, i + 2)[0]
        flat.extend([tid] * cnt)

    assert flat == [5, 7, -1, -1], f"got {flat}"


# ---------------------------------------------------------------------------
# T-14 – Chunk index (1, 0) maps to correct tiles, not absolute coords
# ---------------------------------------------------------------------------


def test_tiles_endpoint_chunk_index_maps_to_correct_tiles() -> None:
    """chunk_x/chunk_y are indices: (1,0) size=2 → tiles x=2..3, y=0..1."""
    air = Tile(tile_id=None, wall_id=None, liquid=0, flags=0)
    t5 = Tile(tile_id=5, wall_id=None, liquid=0, flags=0)
    t7 = Tile(tile_id=7, wall_id=None, liquid=0, flags=0)
    # 4-wide × 2-high grid: only x=2,3 carry real tiles
    grid = TileGrid(
        [
            [air, air],  # x=0
            [air, air],  # x=1
            [t5, air],  # x=2: (2,0)=5, (2,1)=air
            [t7, air],  # x=3: (3,0)=7, (3,1)=air
        ]
    )
    meta = WorldMetadata(
        name="T14",
        width=4,
        height=2,
        version=269,
        seed="0",
        size="small",
        hardmode=False,
    )
    world = World(metadata=meta, tiles=grid, chests=(), signs=())

    repo = _FakeRepo()
    world_id = repo.store(world)
    client = _make_client(repo, _FakeCatalog([]), _FakeSearch(_SEARCH_RESULT))

    resp = client.get(
        f"/api/worlds/{world_id}/tiles",
        params={"chunk_x": 1, "chunk_y": 0, "chunk_size": 2},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["width"] == 2
    assert body["height"] == 2

    raw = base64.b64decode(body["payload"])
    flat: list[int] = []
    for i in range(0, len(raw), 4):
        tid = _struct.unpack_from("<h", raw, i)[0]
        cnt = _struct.unpack_from("<H", raw, i + 2)[0]
        flat.extend([tid] * cnt)

    assert flat == [5, 7, -1, -1], f"got {flat}"


# ---------------------------------------------------------------------------
# T-15 – Out-of-bounds chunk returns empty width/height and empty payload
# ---------------------------------------------------------------------------


def test_tiles_endpoint_out_of_bounds_chunk_returns_empty() -> None:
    air = Tile(tile_id=None, wall_id=None, liquid=0, flags=0)
    grid = TileGrid([[air, air], [air, air]])  # 2×2
    meta = WorldMetadata(
        name="T15",
        width=2,
        height=2,
        version=269,
        seed="0",
        size="small",
        hardmode=False,
    )
    world = World(metadata=meta, tiles=grid, chests=(), signs=())

    repo = _FakeRepo()
    world_id = repo.store(world)
    client = _make_client(repo, _FakeCatalog([]), _FakeSearch(_SEARCH_RESULT))

    resp = client.get(
        f"/api/worlds/{world_id}/tiles",
        params={"chunk_x": 5, "chunk_y": 5, "chunk_size": 2},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["width"] == 0
    assert body["height"] == 0
    assert body["payload"] == ""


# ---------------------------------------------------------------------------
# T-16 – _chunk_bounds pure function: indices → tile range
# ---------------------------------------------------------------------------


def test_chunk_bounds_returns_correct_tile_range() -> None:
    from twi.api_rest.router import _chunk_bounds  # type: ignore[attr-defined]

    # Interior chunk: index (1,2), size=128, 8400×2400
    sx, sy, w, h = _chunk_bounds(1, 2, 128, 8400, 2400)
    assert sx == 128
    assert sy == 256
    assert w == 128
    assert h == 128

    # Partial edge chunk: last column of 8400-wide world with size=128
    # 65 * 128 = 8320; remaining = 8400 - 8320 = 80
    sx, sy, w, h = _chunk_bounds(65, 0, 128, 8400, 2400)
    assert sx == 8320
    assert w == 80

    # Out-of-bounds → zero area
    sx, sy, w, h = _chunk_bounds(100, 100, 128, 10, 10)
    assert w == 0
    assert h == 0
