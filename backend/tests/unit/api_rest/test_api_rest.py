"""Tests for B5 – api-rest (T-01 … T-13)."""

from __future__ import annotations

import base64
import json
import logging
import struct as _struct
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from starlette.exceptions import HTTPException as StarletteHTTPException

from twi.api_rest import (
    NpcDto,
    TileDetailDto,
    TileEntityDto,
    TilesChunkDto,
    UploadTooLargeError,
    WorldMetadataDto,
    XApiVersionMiddleware,
    register_error_handlers,
)
from twi.api_rest.router import _encode_chunk, _encode_chunk_v2, create_router
from twi.app import Settings, create_app
from twi.item_catalog import ItemCatalog, ItemDetail, ItemNotFoundError, ItemSummary
from twi.tile_search import SearchMatch, SearchResult, TileSearchEngine
from twi.wld_parser import (
    Chest,
    ChestItem,
    Npc,
    Sign,
    Tile,
    TileEntity,
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

    def delete_strict(self, world_id: str) -> None:
        if world_id not in self._worlds:
            raise WorldNotFoundError(world_id)
        del self._worlds[world_id]

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
    tile = Tile(
        tile_id=None, wall_id=None, liquid_type="none", liquid_amount=0, flags=0
    )
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
    register_error_handlers(app)
    app.add_middleware(XApiVersionMiddleware)
    router = create_router(
        repo=repo,
        catalog=catalog,
        search=search,
        parser=parser,
        max_upload_mb=max_upload_mb,
    )
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


def _decode_base64_rle_v1(payload: str) -> list[int]:
    raw = base64.b64decode(payload)
    assert len(raw) % 4 == 0

    flat: list[int] = []
    for i in range(0, len(raw), 4):
        tid = _struct.unpack_from("<h", raw, i)[0]
        cnt = _struct.unpack_from("<H", raw, i + 2)[0]
        flat.extend([tid] * cnt)
    return flat


def _error_code(response_json: dict[str, object]) -> str:
    error = response_json["error"]
    assert isinstance(error, dict)
    code = error["code"]
    assert isinstance(code, str)
    return code


@pytest.fixture()
def client(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> TestClient:
    return _make_client(repo, catalog, search_engine)


def _make_bootstrap_client(max_upload_mb: int = 1) -> TestClient:
    return TestClient(
        create_app(Settings(max_upload_mb=max_upload_mb)),
        raise_server_exceptions=False,
    )


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
    assert response.json()["error"]["code"] == "upload_too_large"


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
# T-03b – POST /api/worlds WldParseError codes propagate to details.parser_code
# ---------------------------------------------------------------------------

_PARSE_ERROR_CASES: list[tuple[str, dict[str, object]]] = [
    ("invalid_footer", {"offset": 42}),
    ("corrupt", {"section": "tiles"}),
    ("truncated", {}),
    ("unsupported_version", {"version": 999}),
]


@pytest.mark.parametrize(("exc_code", "exc_details"), _PARSE_ERROR_CASES)
def test_post_world_parse_error_includes_parser_code(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
    exc_code: str,
    exc_details: dict[str, object],
    caplog: pytest.LogCaptureFixture,
) -> None:
    def _failing_parser(data: bytes) -> World:
        raise WldParseError("parse failed", code=exc_code, details=exc_details)

    client = _make_client(repo, catalog, search_engine, parser=_failing_parser)
    with caplog.at_level(logging.WARNING, logger="twi.api_rest.router"):
        response = client.post(
            "/api/worlds",
            files={"file": ("world.wld", b"baddata", "application/octet-stream")},
        )

    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "invalid_wld"
    details = body["error"]["details"]
    assert isinstance(details, dict)
    assert details["parser_code"] == exc_code

    log_text = " ".join(r.message for r in caplog.records)
    assert exc_code in log_text
    if exc_details:
        for key in exc_details:
            assert key in log_text or str(exc_details[key]) in log_text


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
    assert r_upload.headers.get("x-api-version") == "0.2"

    world_id = r_upload.json()["world_id"]

    r_get_meta = client.get(f"/api/worlds/{world_id}")
    assert r_get_meta.headers.get("x-api-version") == "0.2"

    r_404 = client.get("/api/worlds/nonexistent")
    assert r_404.headers.get("x-api-version") == "0.2"

    r_search_400 = client.get(f"/api/worlds/{world_id}/search")
    assert r_search_400.headers.get("x-api-version") == "0.2"

    r_items = client.get("/api/items", params={"q": ""})
    assert r_items.headers.get("x-api-version") == "0.2"

    r_delete = client.delete(f"/api/worlds/{world_id}")
    assert r_delete.headers.get("x-api-version") == "0.2"


def test_413_upload_too_large_has_error_dto_shape(
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
    body = response.json()
    assert set(body) == {"error"}
    assert _error_code(body) == "upload_too_large"
    assert "detail" not in body


def test_413_response_has_x_api_version_header() -> None:
    response = _make_bootstrap_client(max_upload_mb=1).post(
        "/api/worlds",
        content=b"x" * (2 * 1024 * 1024),
        headers={"Content-Type": "application/octet-stream"},
    )

    assert response.status_code == 413
    assert response.headers.get("x-api-version") == "0.2"


def test_router_and_middleware_return_same_413_code(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    router_response = _make_client(repo, catalog, search_engine, max_upload_mb=0).post(
        "/api/worlds",
        files={"file": ("world.wld", b"x", "application/octet-stream")},
    )
    middleware_response = _make_bootstrap_client(max_upload_mb=1).post(
        "/api/worlds",
        content=b"x" * (2 * 1024 * 1024),
        headers={"Content-Type": "application/octet-stream"},
    )

    assert router_response.status_code == 413
    assert middleware_response.status_code == 413
    assert _error_code(router_response.json()) == _error_code(
        middleware_response.json()
    )


def test_422_validation_returns_error_dto_not_detail(client: TestClient) -> None:
    response = client.get("/api/items", params={"limit": "not-an-int"})

    assert response.status_code == 422
    body = response.json()
    assert "detail" not in body
    assert _error_code(body) == "validation_error"
    error = body["error"]
    assert isinstance(error, dict)
    assert isinstance(error["details"], list)


def test_422_response_has_x_api_version_header(client: TestClient) -> None:
    response = client.get("/api/items", params={"limit": "not-an-int"})

    assert response.status_code == 422
    assert response.headers.get("x-api-version") == "0.2"


def test_404_unknown_world_has_error_dto_and_version_header(
    client: TestClient,
) -> None:
    response = client.get("/api/worlds/does-not-exist")

    assert response.status_code == 404
    assert response.headers.get("x-api-version") == "0.2"
    body = response.json()
    assert set(body) == {"error"}
    assert _error_code(body) == "world_not_found"


def test_500_unhandled_exception_returns_error_dto_without_traceback() -> None:
    app = FastAPI()
    register_error_handlers(app)
    app.add_middleware(XApiVersionMiddleware)

    @app.get("/boom")
    def boom() -> dict[str, str]:
        raise RuntimeError("secret traceback marker")

    response = TestClient(app, raise_server_exceptions=False).get("/boom")

    assert response.status_code == 500
    assert response.headers.get("x-api-version") == "0.2"
    assert _error_code(response.json()) == "internal_error"
    text = response.text.lower()
    assert "traceback" not in text
    assert "runtimeerror" not in text
    assert "secret" not in text


def test_upload_too_large_handler_returns_canonical_error() -> None:
    app = FastAPI()
    register_error_handlers(app)
    app.add_middleware(XApiVersionMiddleware)

    @app.post("/too-large")
    def too_large() -> None:
        raise UploadTooLargeError(25)

    response = TestClient(app, raise_server_exceptions=False).post("/too-large")

    assert response.status_code == 413
    assert _error_code(response.json()) == "upload_too_large"
    assert "25 MB" in response.json()["error"]["message"]


def test_validation_error_handler_normalizes_non_sequence_location() -> None:
    app = FastAPI()
    register_error_handlers(app)
    app.add_middleware(XApiVersionMiddleware)

    @app.get("/invalid")
    def invalid() -> None:
        raise RequestValidationError(
            [{"loc": "custom-location", "msg": None, "type": "custom_error"}]
        )

    response = TestClient(app, raise_server_exceptions=False).get("/invalid")

    assert response.status_code == 422
    body = response.json()
    assert _error_code(body) == "validation_error"
    assert body["error"]["details"] == [
        {"loc": ["custom-location"], "message": "None", "type": "custom_error"}
    ]


def test_http_exception_handler_preserves_structured_error_detail() -> None:
    app = FastAPI()
    register_error_handlers(app)
    app.add_middleware(XApiVersionMiddleware)

    @app.get("/structured")
    def structured() -> None:
        raise StarletteHTTPException(
            status_code=409,
            detail={
                "code": "conflict",
                "message": "Conflict",
                "details": {"field": "world_id"},
            },
        )

    response = TestClient(app, raise_server_exceptions=False).get("/structured")

    assert response.status_code == 409
    assert response.json()["error"] == {
        "code": "conflict",
        "message": "Conflict",
        "details": {"field": "world_id"},
    }


def test_http_exception_handler_falls_back_for_unknown_status_and_detail() -> None:
    app = FastAPI()
    register_error_handlers(app)
    app.add_middleware(XApiVersionMiddleware)

    @app.get("/unknown")
    def unknown() -> None:
        raise StarletteHTTPException(status_code=499, detail={"not": "canonical"})

    response = TestClient(app, raise_server_exceptions=False).get("/unknown")

    assert response.status_code == 499
    assert response.json()["error"] == {
        "code": "http_error",
        "message": "HTTP error",
        "details": None,
    }


def test_x_api_version_header_present_on_2xx(client: TestClient) -> None:
    response = client.get("/api/items", params={"q": "zen"})

    assert response.status_code == 200
    assert response.headers.get("x-api-version") == "0.2"


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
    expected = json.loads(snapshot_path.read_text(encoding="utf-8"))
    assert schema == expected


def test_contracts_openapi_json_matches_app_schema() -> None:
    """Public contract artifact mirrors twi.app.create_app() schema."""
    contracts_path = (
        Path(__file__).resolve().parents[4] / "docs" / "contracts" / "openapi.json"
    )
    app = create_app(Settings(max_upload_mb=200))
    expected = json.loads(contracts_path.read_text(encoding="utf-8"))
    assert app.openapi() == expected


# ---------------------------------------------------------------------------
# T-13 – GET /api/worlds/{id}/tiles payload decodes as row-major int16 RLE
# ---------------------------------------------------------------------------


def test_get_tiles_endpoint_returns_canonical_encoding_base64_rle_v1() -> None:
    repo = _FakeRepo()
    world_id = repo.store(_make_world())
    client = _make_client(repo, _FakeCatalog([]), _FakeSearch(_SEARCH_RESULT))

    response = client.get(f"/api/worlds/{world_id}/tiles")

    assert response.status_code == 200
    assert response.json()["encoding"] == "base64-rle-v1"


def test_encode_chunk_round_trips_known_tiles_as_base64_rle_v1() -> None:
    t5 = Tile(tile_id=5, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
    t7 = Tile(tile_id=7, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
    air = Tile(tile_id=None, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
    grid = TileGrid(
        [
            [t5, t7],
            [t5, t7],
            [air, t7],
        ]
    )

    width, height, payload = _encode_chunk(grid, chunk_x=0, chunk_y=0, chunk_size=3)

    assert width == 3
    assert height == 2
    assert _decode_base64_rle_v1(payload) == [5, 5, -1, 7, 7, 7]


def test_get_tiles_payload_encodes_row_major_int16_rle() -> None:
    """Payload must be base64( runs of (tileId:int16LE, count:uint16LE) ),
    in row-major order (y outer, x inner), with -1 for air (None tile_id).

    Grid layout (width=2, height=2):
        (x=0,y=0)=tile_id 5   (x=1,y=0)=tile_id 7
        (x=0,y=1)=air(-1)     (x=1,y=1)=air(-1)

    Expected flat row-major sequence: [5, 7, -1, -1]
    """
    t5 = Tile(tile_id=5, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
    t7 = Tile(tile_id=7, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
    air = Tile(tile_id=None, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
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

    flat = _decode_base64_rle_v1(body["payload"])
    assert flat == [5, 7, -1, -1], f"got {flat}"


# ---------------------------------------------------------------------------
# T-14 – Chunk index (1, 0) maps to correct tiles, not absolute coords
# ---------------------------------------------------------------------------


def test_tiles_endpoint_chunk_index_maps_to_correct_tiles() -> None:
    """chunk_x/chunk_y are indices: (1,0) size=2 → tiles x=2..3, y=0..1."""
    air = Tile(tile_id=None, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
    t5 = Tile(tile_id=5, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
    t7 = Tile(tile_id=7, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
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

    flat = _decode_base64_rle_v1(body["payload"])
    assert flat == [5, 7, -1, -1], f"got {flat}"


# ---------------------------------------------------------------------------
# T-15 – Out-of-bounds chunk returns empty width/height and empty payload
# ---------------------------------------------------------------------------


def test_tiles_endpoint_out_of_bounds_chunk_returns_empty() -> None:
    air = Tile(tile_id=None, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
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


# ---------------------------------------------------------------------------
# T-27 – GET /api/items returns 503 when catalog unavailable
# ---------------------------------------------------------------------------


def test_items_returns_503_when_catalog_unavailable(
    repo: _FakeRepo,
    search_engine: _FakeSearch,
) -> None:
    from twi.item_catalog import ItemCatalogUnavailableError

    class _NullCat:
        def search(self, query: str, limit: int = 20) -> list[ItemSummary]:
            raise ItemCatalogUnavailableError("unavailable")

        def get(self, item_id: int) -> ItemDetail:
            raise ItemCatalogUnavailableError("unavailable")

    client = _make_client(repo, _NullCat(), search_engine)
    resp = client.get("/api/items", params={"q": "dirt"})
    assert resp.status_code == 503
    body = resp.json()
    assert body["error"]["code"] == "catalog_unavailable"


# ---------------------------------------------------------------------------
# T-28 – GET /api/items/{id} returns 503 when catalog unavailable
# ---------------------------------------------------------------------------


def test_get_item_by_id_returns_503_when_catalog_unavailable(
    repo: _FakeRepo,
    search_engine: _FakeSearch,
) -> None:
    from twi.item_catalog import ItemCatalogUnavailableError

    class _NullCat:
        def search(self, query: str, limit: int = 20) -> list[ItemSummary]:
            raise ItemCatalogUnavailableError("unavailable")

        def get(self, item_id: int) -> ItemDetail:
            raise ItemCatalogUnavailableError("unavailable")

    client = _make_client(repo, _NullCat(), search_engine)
    resp = client.get("/api/items/757")
    assert resp.status_code == 503
    body = resp.json()
    assert body["error"]["code"] == "catalog_unavailable"


# ---------------------------------------------------------------------------
# v0.2 DTOs
# ---------------------------------------------------------------------------


def test_world_metadata_dto_v0_2_has_spawn_and_layer_fields() -> None:
    dto = WorldMetadataDto(
        name="W",
        width=8400,
        height=2400,
        version=279,
        seed="0",
        size="large",
        hardmode=True,
        spawn_x=4200,
        spawn_y=350,
        world_surface_y=320.0,
        rock_layer_y=900.0,
        hell_layer_y=2100.0,
    )
    assert dto.spawn_x == 4200
    assert dto.spawn_y == 350
    assert dto.world_surface_y == 320.0
    assert dto.rock_layer_y == 900.0
    assert dto.hell_layer_y == 2100.0


def test_npc_dto_validates() -> None:
    dto = NpcDto(id=17, name="Guide", type="town", x=4200, y=348)
    assert dto.type == "town"
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        NpcDto(id=17, name="X", type="evil", x=0, y=0)  # type: ignore[arg-type]


def test_tile_entity_dto_validates() -> None:
    dto = TileEntityDto(id=7, type="item_frame", x=10, y=20)
    assert dto.type == "item_frame"


def test_tile_detail_dto_optional_fields_default_to_none() -> None:
    dto = TileDetailDto(
        x=1, y=2, tile_id=213, wall_id=2, liquid_type="water", liquid_amount=128
    )
    assert dto.frame_x is None
    assert dto.tile_entity_id is None


def test_tiles_chunk_dto_accepts_v2_encoding() -> None:
    dto = TilesChunkDto(
        chunk_x=0,
        chunk_y=0,
        width=0,
        height=0,
        encoding="base64-rle-v2",
        payload="",
    )
    assert dto.encoding == "base64-rle-v2"


# ---------------------------------------------------------------------------
# base64-rle-v2 encoder + decoder helper
# ---------------------------------------------------------------------------


_LIQ_INT_TO_NAME = {
    0: "none",
    1: "water",
    2: "lava",
    3: "honey",
    4: "shimmer",
}


def _decode_base64_rle_v2(
    payload: str, width: int, height: int
) -> list[tuple[int, int, str, int, int | None, int | None, int]]:
    """Decode v2 to flat row-major tuples:
    (tile_id, wall_id, liquid_name, liquid_amount, frame_x, frame_y, flags)."""
    raw = base64.b64decode(payload)
    assert raw[:4] == b"TWv2", "missing TWv2 magic"
    frame_count = _struct.unpack_from("<H", raw, 4)[0]
    reserved = _struct.unpack_from("<H", raw, 6)[0]
    assert reserved == 0

    pos = 8
    runs: list[tuple[int, int, int, int, int, int, int]] = []
    consumed = 0
    total = width * height
    while consumed < total:
        tid, wall, lt, la, fx_hi, flags, count = _struct.unpack_from(
            "<hHBBBBH", raw, pos
        )
        pos += 10
        runs.append((tid, wall, lt, la, fx_hi, flags, count))
        consumed += count
    assert consumed == total

    frames: dict[int, tuple[int, int]] = {}
    for _ in range(frame_count):
        run_index, fx_lo, fres, frame_y = _struct.unpack_from("<HBBH", raw, pos)
        pos += 6
        assert fres == 0
        frames[run_index] = (fx_lo, frame_y)
    assert pos == len(raw)

    out: list[tuple[int, int, str, int, int | None, int | None, int]] = []
    for idx, (tid, wall, lt, la, fx_hi, flags, count) in enumerate(runs):
        if flags & 0x01:
            fx_lo, fy = frames[idx]
            fx: int | None = (fx_hi << 8) | fx_lo
            fy_opt: int | None = fy
        else:
            fx, fy_opt = None, None
        for _ in range(count):
            out.append((tid, wall, _LIQ_INT_TO_NAME[lt], la, fx, fy_opt, flags))
    return out


def test_encode_chunk_v2_round_trips_diverse_tiles() -> None:
    air = Tile(tile_id=None, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
    stone = Tile(tile_id=1, wall_id=2, liquid_type="none", liquid_amount=0, flags=0)
    water = Tile(tile_id=53, wall_id=0, liquid_type="water", liquid_amount=200, flags=0)
    lava = Tile(tile_id=53, wall_id=0, liquid_type="lava", liquid_amount=128, flags=0)
    framed = Tile(
        tile_id=21,
        wall_id=4,
        liquid_type="none",
        liquid_amount=0,
        flags=0,
        frame_x=300,
        frame_y=18,
    )
    framed2 = Tile(
        tile_id=21,
        wall_id=4,
        liquid_type="none",
        liquid_amount=0,
        flags=0,
        frame_x=302,
        frame_y=18,
    )
    grid = TileGrid(
        [
            [air, stone, water, framed],
            [air, stone, lava, framed2],
            [air, stone, water, framed],
        ]
    )

    width, height, payload = _encode_chunk_v2(grid, 0, 0, 8)
    assert width == 3
    assert height == 4

    decoded = _decode_base64_rle_v2(payload, width, height)

    expected: list[tuple[int, int, str, int, int | None, int | None]] = []
    for y in range(4):
        for x in range(3):
            t = grid[x][y]
            tid = -1 if t.tile_id is None else t.tile_id
            wall = t.wall_id if t.wall_id is not None else 0
            expected.append(
                (tid, wall, t.liquid_type, t.liquid_amount, t.frame_x, t.frame_y)
            )
    actual = [(d[0], d[1], d[2], d[3], d[4], d[5]) for d in decoded]
    assert actual == expected


def test_encode_chunk_v2_empty_chunk_emits_header_only() -> None:
    air = Tile(tile_id=None, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
    grid = TileGrid([[air]])
    width, height, payload = _encode_chunk_v2(grid, chunk_x=5, chunk_y=5, chunk_size=2)
    assert width == 0 and height == 0
    raw = base64.b64decode(payload)
    assert raw == b"TWv2" + _struct.pack("<HH", 0, 0)


def test_get_tiles_v1_byte_snapshot_unchanged() -> None:
    """v1 encoder bytes must not drift while v2 ships."""
    t5 = Tile(tile_id=5, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
    t7 = Tile(tile_id=7, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
    grid = TileGrid([[t5, t5], [t7, t7]])
    width, height, payload = _encode_chunk(grid, 0, 0, 2)
    assert (width, height) == (2, 2)
    raw = base64.b64decode(payload)
    # row 0: 5,7 ; row 1: 5,7 → runs (5,1),(7,1),(5,1),(7,1) = 16 bytes
    expected = (
        _struct.pack("<hH", 5, 1)
        + _struct.pack("<hH", 7, 1)
        + _struct.pack("<hH", 5, 1)
        + _struct.pack("<hH", 7, 1)
    )
    assert raw == expected


def test_get_tiles_v2_returns_v2_encoding(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    world_id = repo.store(_make_world())
    client = _make_client(repo, catalog, search_engine)

    response = client.get(
        f"/api/worlds/{world_id}/tiles", params={"encoding": "base64-rle-v2"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["encoding"] == "base64-rle-v2"
    raw = base64.b64decode(body["payload"])
    assert raw[:4] == b"TWv2"


def test_get_tiles_default_encoding_is_v1(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    world_id = repo.store(_make_world())
    client = _make_client(repo, catalog, search_engine)

    response = client.get(f"/api/worlds/{world_id}/tiles")
    assert response.status_code == 200
    assert response.json()["encoding"] == "base64-rle-v1"


def test_encode_chunk_v2_handles_negative_frame_coordinates() -> None:
    """`_read_tiles` returns `frame_x`/`frame_y` as signed int16; negative
    values must not crash `_encode_chunk_v2`. Stored as raw 16-bit bit
    pattern (two's complement)."""
    framed_neg = Tile(
        tile_id=21,
        wall_id=4,
        liquid_type="none",
        liquid_amount=0,
        flags=0,
        frame_x=-1,
        frame_y=-2,
    )
    grid = TileGrid([[framed_neg]])
    width, height, payload = _encode_chunk_v2(grid, 0, 0, 8)
    assert width == 1 and height == 1
    raw = base64.b64decode(payload)
    # 8B header + 10B run + 6B frame block
    assert len(raw) == 24
    assert raw[:4] == b"TWv2"
    # run record layout: tile_id(2) wall(2) liq_t(1) liq_a(1) fx_hi(1) flags(1) count(2)
    fx_hi = raw[8 + 6]
    flags_byte = raw[8 + 7]
    assert fx_hi == 0xFF
    assert flags_byte & 0x01 == 0x01
    # frame block: fx_lo=0xFF, reserved=0, frame_y=0xFFFE (=-2 reinterpreted)
    fx_lo = raw[8 + 10 + 2]
    fres = raw[8 + 10 + 3]
    frame_y = _struct.unpack_from("<H", raw, 8 + 10 + 4)[0]
    assert fx_lo == 0xFF
    assert fres == 0
    assert frame_y == 0xFFFE


def test_get_tiles_v2_with_negative_frames_returns_200(
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    """Regression: a real-world tile with negative int16 frame coords used
    to make `GET /tiles?encoding=base64-rle-v2` return 500 (`internal_error`),
    leaving holes in the canvas. Must now return 200."""
    framed_neg = Tile(
        tile_id=21,
        wall_id=4,
        liquid_type="none",
        liquid_amount=0,
        flags=0,
        frame_x=-1,
        frame_y=-1,
    )
    grid = TileGrid([[framed_neg]])
    meta = WorldMetadata(
        name="N",
        width=1,
        height=1,
        version=279,
        seed="0",
        size="small",
        hardmode=False,
    )
    world = World(metadata=meta, tiles=grid, chests=(), signs=())
    repo = _FakeRepo()
    world_id = repo.store(world)
    client = _make_client(repo, catalog, search_engine)

    resp = client.get(
        f"/api/worlds/{world_id}/tiles", params={"encoding": "base64-rle-v2"}
    )

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["encoding"] == "base64-rle-v2"
    raw = base64.b64decode(body["payload"])
    assert raw[:4] == b"TWv2"


def test_get_tiles_unknown_encoding_returns_400(
    repo: _FakeRepo,
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    world_id = repo.store(_make_world())
    client = _make_client(repo, catalog, search_engine)

    response = client.get(
        f"/api/worlds/{world_id}/tiles", params={"encoding": "rle-v9"}
    )
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "invalid_encoding"


# ---------------------------------------------------------------------------
# GET /api/worlds/{id}/npcs
# ---------------------------------------------------------------------------


def _make_npc(
    npc_id: int,
    name: str,
    x: float,
    y: float,
    *,
    is_town: bool = True,
) -> Npc:
    return Npc(
        id=npc_id,
        name=name,
        position_x=x,
        position_y=y,
        is_homeless=False,
        home_x=int(x),
        home_y=int(y),
        is_town_npc=is_town,
    )


def _make_world_with_npcs(npcs: list[Npc]) -> World:
    base = _make_world()
    return World(
        metadata=base.metadata,
        tiles=base.tiles,
        chests=(),
        signs=(),
        npcs=npcs,
    )


def test_get_npcs_returns_all_npcs(
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    repo = _FakeRepo()
    npcs = [
        _make_npc(17, "Guide", 4200.5, 348.0, is_town=True),
        _make_npc(18, "Merchant", 4205.9, 348.0, is_town=True),
        _make_npc(37, "Old Man", 100.0, 200.0, is_town=False),
    ]
    world_id = repo.store(_make_world_with_npcs(npcs))
    client = _make_client(repo, catalog, search_engine)

    response = client.get(f"/api/worlds/{world_id}/npcs")
    assert response.status_code == 200
    body = response.json()
    assert "npcs" in body
    assert len(body["npcs"]) == 3
    first = body["npcs"][0]
    assert first == {"id": 17, "name": "Guide", "type": "town", "x": 4200, "y": 348}
    last = body["npcs"][2]
    assert last["type"] == "banner"


def test_get_npcs_town_only_filters_non_town(
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    repo = _FakeRepo()
    npcs = [
        _make_npc(17, "Guide", 10.0, 20.0, is_town=True),
        _make_npc(37, "Old Man", 100.0, 200.0, is_town=False),
    ]
    world_id = repo.store(_make_world_with_npcs(npcs))
    client = _make_client(repo, catalog, search_engine)

    response = client.get(f"/api/worlds/{world_id}/npcs", params={"town_only": "true"})
    assert response.status_code == 200
    body = response.json()
    assert len(body["npcs"]) == 1
    assert body["npcs"][0]["id"] == 17
    assert body["npcs"][0]["type"] == "town"


def test_get_npcs_empty_world_returns_empty_list(
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    repo = _FakeRepo()
    world_id = repo.store(_make_world_with_npcs([]))
    client = _make_client(repo, catalog, search_engine)

    response = client.get(f"/api/worlds/{world_id}/npcs")
    assert response.status_code == 200
    assert response.json() == {"npcs": []}


def test_get_npcs_unknown_world_returns_404(client: TestClient) -> None:
    response = client.get("/api/worlds/ghost-id/npcs")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "world_not_found"


# ---------------------------------------------------------------------------
# T-29..T-32 – GET /api/worlds/{id}/tile?x=&y=
# ---------------------------------------------------------------------------


def _tile_world_with_entity() -> World:
    air = Tile(tile_id=None, wall_id=None, liquid_type="none", liquid_amount=0, flags=0)
    framed = Tile(
        tile_id=21,
        wall_id=4,
        liquid_type="water",
        liquid_amount=128,
        flags=0,
        frame_x=300,
        frame_y=18,
    )
    grid = TileGrid([[air, air], [framed, air]])
    meta = WorldMetadata(
        name="W",
        width=2,
        height=2,
        version=279,
        seed="0",
        size="small",
        hardmode=False,
    )
    chest = Chest(
        chest_id=12,
        x=1,
        y=0,
        name="",
        items=tuple(ChestItem(0, 0, 0) for _ in range(40)),
    )
    sign = Sign(x=1, y=0, text="hello")
    entity = TileEntity(id=7, entity_type=0, x=1, y=0, data={})
    return World(
        metadata=meta,
        tiles=grid,
        chests=(chest,),
        signs=(sign,),
        npcs=[],
        tile_entities=[entity],
    )


def test_get_tile_returns_full_detail_dto(
    catalog: _FakeCatalog, search_engine: _FakeSearch
) -> None:
    repo = _FakeRepo()
    world_id = repo.store(_tile_world_with_entity())
    client = _make_client(repo, catalog, search_engine)

    resp = client.get(f"/api/worlds/{world_id}/tile", params={"x": 1, "y": 0})

    assert resp.status_code == 200
    body = resp.json()
    assert body["x"] == 1
    assert body["y"] == 0
    assert body["tile_id"] == 21
    assert body["wall_id"] == 4
    assert body["liquid_type"] == "water"
    assert body["liquid_amount"] == 128
    assert body["frame_x"] == 300
    assert body["frame_y"] == 18
    assert body["chest_id"] == 12
    assert body["sign_id"] == 0
    assert body["tile_entity_id"] == 7


def test_get_tile_empty_coordinate_returns_nulls(
    catalog: _FakeCatalog, search_engine: _FakeSearch
) -> None:
    repo = _FakeRepo()
    world_id = repo.store(_tile_world_with_entity())
    client = _make_client(repo, catalog, search_engine)

    resp = client.get(f"/api/worlds/{world_id}/tile", params={"x": 0, "y": 0})

    assert resp.status_code == 200
    body = resp.json()
    assert body["x"] == 0
    assert body["y"] == 0
    assert body["tile_id"] is None
    assert body["wall_id"] is None
    assert body["liquid_type"] == "none"
    assert body["liquid_amount"] == 0
    assert body["frame_x"] is None
    assert body["frame_y"] is None
    assert body["chest_id"] is None
    assert body["sign_id"] is None
    assert body["tile_entity_id"] is None


@pytest.mark.parametrize(
    "x,y",
    [(-1, 0), (0, -1), (2, 0), (0, 2), (10, 10)],
)
def test_get_tile_out_of_bounds_returns_400(
    x: int, y: int, catalog: _FakeCatalog, search_engine: _FakeSearch
) -> None:
    repo = _FakeRepo()
    world_id = repo.store(_tile_world_with_entity())
    client = _make_client(repo, catalog, search_engine)

    resp = client.get(f"/api/worlds/{world_id}/tile", params={"x": x, "y": y})

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "coordinates_out_of_bounds"


def test_get_tile_unknown_world_returns_404(client: TestClient) -> None:
    resp = client.get("/api/worlds/ghost/tile", params={"x": 0, "y": 0})

    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "world_not_found"


# ---------------------------------------------------------------------------
# iter-011: DELETE strict + search frame filter + X-API-Version: 0.2
# ---------------------------------------------------------------------------


def test_delete_world_invokes_delete_strict(
    catalog: _FakeCatalog,
    search_engine: _FakeSearch,
) -> None:
    calls: list[str] = []

    class _SpyRepo(_FakeRepo):
        def delete_strict(self, world_id: str) -> None:  # type: ignore[override]
            calls.append(world_id)
            super().delete_strict(world_id)

    repo = _SpyRepo()
    world_id = repo.store(_make_world())
    client = _make_client(repo, catalog, search_engine)

    response = client.delete(f"/api/worlds/{world_id}")

    assert response.status_code == 204
    assert calls == [world_id]


def _frame_search_world() -> tuple[World, list[SearchMatch]]:
    framed_a = Tile(
        tile_id=21,
        wall_id=0,
        liquid_type="none",
        liquid_amount=0,
        flags=0,
        frame_x=300,
        frame_y=18,
    )
    framed_b = Tile(
        tile_id=21,
        wall_id=0,
        liquid_type="none",
        liquid_amount=0,
        flags=0,
        frame_x=320,
        frame_y=18,
    )
    framed_c = Tile(
        tile_id=21,
        wall_id=0,
        liquid_type="none",
        liquid_amount=0,
        flags=0,
        frame_x=300,
        frame_y=36,
    )
    grid = TileGrid([[framed_a, framed_b, framed_c]])
    meta = WorldMetadata(
        name="F",
        width=1,
        height=3,
        version=279,
        seed="0",
        size="small",
        hardmode=False,
    )
    world = World(metadata=meta, tiles=grid, chests=(), signs=())
    matches = [
        SearchMatch(x=0, y=0, source="block"),
        SearchMatch(x=0, y=1, source="block"),
        SearchMatch(x=0, y=2, source="block"),
    ]
    return world, matches


def test_search_filters_by_frame_x_and_frame_y(
    catalog: _FakeCatalog,
) -> None:
    world, matches = _frame_search_world()
    repo = _FakeRepo()
    world_id = repo.store(world)
    engine = _FakeSearch(SearchResult(item_id=21, total=3, matches=tuple(matches)))
    client = _make_client(repo, catalog, engine)

    resp = client.get(
        f"/api/worlds/{world_id}/search",
        params={"item_id": 21, "frame_x": 300, "frame_y": 18},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["matches"] == [
        {"x": 0, "y": 0, "source": "block", "chest_id": None, "stack": None}
    ]


def test_search_without_frame_filter_returns_all_matches(
    catalog: _FakeCatalog,
) -> None:
    world, matches = _frame_search_world()
    repo = _FakeRepo()
    world_id = repo.store(world)
    engine = _FakeSearch(SearchResult(item_id=21, total=3, matches=tuple(matches)))
    client = _make_client(repo, catalog, engine)

    resp = client.get(f"/api/worlds/{world_id}/search", params={"item_id": 21})

    assert resp.status_code == 200
    assert resp.json()["total"] == 3


def test_search_frame_x_only_filters_correctly(catalog: _FakeCatalog) -> None:
    world, matches = _frame_search_world()
    repo = _FakeRepo()
    world_id = repo.store(world)
    engine = _FakeSearch(SearchResult(item_id=21, total=3, matches=tuple(matches)))
    client = _make_client(repo, catalog, engine)

    resp = client.get(
        f"/api/worlds/{world_id}/search",
        params={"item_id": 21, "frame_x": 300},
    )

    assert resp.status_code == 200
    body = resp.json()
    # frame_x=300 matches (0,0) and (0,2)
    assert body["total"] == 2


def test_x_api_version_header_is_0_2_on_docs(client: TestClient) -> None:
    resp = client.get("/docs")
    assert resp.headers.get("x-api-version") == "0.2"


def test_x_api_version_header_present_on_503_catalog_unavailable(
    repo: _FakeRepo,
    search_engine: _FakeSearch,
) -> None:
    from twi.item_catalog import ItemCatalogUnavailableError

    class _NullCat:
        def search(self, query: str, limit: int = 20) -> list[ItemSummary]:
            raise ItemCatalogUnavailableError("unavailable")

        def get(self, item_id: int) -> ItemDetail:
            raise ItemCatalogUnavailableError("unavailable")

    client = _make_client(repo, _NullCat(), search_engine)
    resp = client.get("/api/items", params={"q": "dirt"})
    assert resp.status_code == 503
    assert resp.headers.get("x-api-version") == "0.2"
