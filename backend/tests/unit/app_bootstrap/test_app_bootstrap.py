"""Tests for B6 – app-bootstrap (TDD red → green)."""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Iterator
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from twi.app import Settings, create_app
from twi.observability import (
    ACCESS_LOGGER_NAME,
    PURGE_LOGGER_NAME,
    JsonFormatter,
)

# ── helpers ─────────────────────────────────────────────────────────────────


def _client(settings: Settings | None = None) -> TestClient:
    return TestClient(create_app(settings), raise_server_exceptions=False)


# ── T-01 ─────────────────────────────────────────────────────────────────────


def test_create_app_returns_fastapi_with_routes_mounted() -> None:
    app = create_app()
    assert isinstance(app, FastAPI)
    client = TestClient(app, raise_server_exceptions=False)
    # /healthz responde 200 → montado.
    assert client.get("/healthz").status_code == 200
    # POST /api/worlds sin fichero → 422 del router (404 significaría no montado).
    assert client.post("/api/worlds").status_code == 422
    # GET /api/items → 200 (catálogo cargado) o 503 (no disponible), nunca 404.
    assert client.get("/api/items", params={"q": "x"}).status_code in (200, 503)


# ── T-02 ─────────────────────────────────────────────────────────────────────


def test_healthz_returns_ok() -> None:
    resp = _client().get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ── T-03 ─────────────────────────────────────────────────────────────────────


def test_cors_header_on_allowed_origin() -> None:
    settings = Settings(cors_origins=["http://allowed.local"])
    resp = _client(settings).get("/healthz", headers={"Origin": "http://allowed.local"})
    assert resp.headers.get("access-control-allow-origin") == "http://allowed.local"


# ── T-04 ─────────────────────────────────────────────────────────────────────


def test_cors_header_absent_on_disallowed_origin() -> None:
    settings = Settings(cors_origins=["http://allowed.local"])
    resp = _client(settings).get(
        "/healthz", headers={"Origin": "http://evil.example.com"}
    )
    assert resp.headers.get("access-control-allow-origin") != "http://evil.example.com"


# ── T-05 ─────────────────────────────────────────────────────────────────────


def test_upload_size_middleware_returns_413_over_limit() -> None:
    settings = Settings(max_upload_mb=1)
    big = b"x" * (2 * 1024 * 1024)  # 2 MB > 1 MB limit
    resp = _client(settings).post(
        "/api/worlds",
        content=big,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert resp.status_code == 413


# ── T-06 ─────────────────────────────────────────────────────────────────────


def test_purge_task_runs_on_schedule() -> None:
    mock_repo = MagicMock()
    mock_repo.purge_expired.return_value = 0

    settings = Settings(purge_interval_seconds=0)

    with patch("twi.app.create_in_memory_repository", return_value=mock_repo):
        app = create_app(settings)
        with TestClient(app):
            time.sleep(0.05)  # allow at least one purge cycle

    mock_repo.purge_expired.assert_called()


# ── helpers for iter-07 ─────────────────────────────────────────────────────


class _ListHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.records: list[logging.LogRecord] = []
        self.formatted: list[str] = []
        self.setFormatter(JsonFormatter())

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)
        self.formatted.append(self.format(record))


@pytest.fixture
def log_capture() -> Iterator[_ListHandler]:
    handler = _ListHandler()
    access = logging.getLogger(ACCESS_LOGGER_NAME)
    purge = logging.getLogger(PURGE_LOGGER_NAME)
    for lg in (access, purge):
        lg.addHandler(handler)
        lg.setLevel(logging.DEBUG)
    try:
        yield handler
    finally:
        for lg in (access, purge):
            lg.removeHandler(handler)


_UUID_V4_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)


# ── T-07 ────────────────────────────────────────────────────────────────────


def test_items_endpoint_returns_503_when_catalog_unavailable(
    tmp_path: Path,
) -> None:
    settings = Settings(
        item_cache_path=tmp_path / "missing-cache.json",
        item_seed_path=tmp_path / "missing-seed.json",
    )
    resp = _client(settings).get("/api/items?q=Zenith")
    assert resp.status_code == 503
    body = resp.json()
    assert body["error"]["code"] == "catalog_unavailable"


def test_get_item_endpoint_returns_503_when_catalog_unavailable(
    tmp_path: Path,
) -> None:
    settings = Settings(
        item_cache_path=tmp_path / "missing-cache.json",
        item_seed_path=tmp_path / "missing-seed.json",
    )
    resp = _client(settings).get("/api/items/757")
    assert resp.status_code == 503
    body = resp.json()
    assert body["error"]["code"] == "catalog_unavailable"


# ── T-08 ────────────────────────────────────────────────────────────────────


def test_request_id_header_generated_when_absent() -> None:
    resp = _client().get("/healthz")
    rid = resp.headers.get("X-Request-Id")
    assert rid is not None
    assert _UUID_V4_RE.match(rid) is not None


# ── T-09 ────────────────────────────────────────────────────────────────────


def test_request_id_header_respected_from_client() -> None:
    incoming = "abcd1234-feed-face-cafe-000000000001"
    resp = _client().get("/healthz", headers={"X-Request-Id": incoming})
    assert resp.headers.get("X-Request-Id") == incoming


# ── T-10 ────────────────────────────────────────────────────────────────────


def test_access_log_is_valid_json_with_required_fields(
    log_capture: _ListHandler,
) -> None:
    resp = _client().get("/healthz")
    rid = resp.headers["X-Request-Id"]

    matched = [
        json.loads(line)
        for line in log_capture.formatted
        if json.loads(line).get("request_id") == rid
    ]
    assert matched, "expected at least one access log entry for request"
    entry = matched[-1]
    for field in (
        "timestamp",
        "level",
        "request_id",
        "method",
        "path",
        "status",
        "duration_ms",
    ):
        assert field in entry, f"missing field {field}"
    assert entry["method"] == "GET"
    assert entry["path"] == "/healthz"
    assert entry["status"] == 200
    assert isinstance(entry["duration_ms"], (int, float))


def test_access_log_includes_error_code_on_failure(
    log_capture: _ListHandler,
) -> None:
    settings = Settings(max_upload_mb=1)
    big = b"x" * (2 * 1024 * 1024)
    resp = _client(settings).post(
        "/api/worlds",
        content=big,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert resp.status_code == 413
    rid = resp.headers["X-Request-Id"]
    matched = [
        json.loads(line)
        for line in log_capture.formatted
        if json.loads(line).get("request_id") == rid
    ]
    assert matched
    entry = matched[-1]
    assert entry["status"] == 413
    assert entry.get("error", {}).get("code") == "upload_too_large"


# ── T-12 (IT-04, E13) ───────────────────────────────────────────────────────


def test_malformed_content_length_returns_400() -> None:
    resp = _client().get("/healthz", headers={"Content-Length": "banana"})
    assert resp.status_code == 400
    body = resp.json()
    assert body["error"]["code"] == "validation_error"


# ── T-13 (IT-04, E20) ───────────────────────────────────────────────────────


def test_unhandled_error_response_has_request_id_and_no_error_code_header() -> None:
    app = create_app()

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("kaboom")

    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/boom")
    assert resp.status_code == 500
    assert resp.json()["error"]["code"] == "internal_error"
    assert "X-Error-Code" not in resp.headers
    rid = resp.headers.get("X-Request-Id")
    assert rid is not None
    assert _UUID_V4_RE.match(rid) is not None


# ── T-14 (IT-04, P08) ───────────────────────────────────────────────────────


def test_purge_logs_only_when_purged(log_capture: _ListHandler) -> None:
    mock_repo = MagicMock()
    mock_repo.purge_expired.return_value = 0

    settings = Settings(purge_interval_seconds=0)

    with patch("twi.app.create_in_memory_repository", return_value=mock_repo):
        app = create_app(settings)
        with TestClient(app):
            time.sleep(0.05)

    mock_repo.purge_expired.assert_called()
    purge_entries = [
        json.loads(line)
        for line in log_capture.formatted
        if json.loads(line).get("event") == "purge"
    ]
    assert purge_entries == []


# ── T-11 ────────────────────────────────────────────────────────────────────


def test_purge_loop_emits_json_log(log_capture: _ListHandler) -> None:
    mock_repo = MagicMock()
    mock_repo.purge_expired.return_value = 3

    settings = Settings(purge_interval_seconds=0)

    with patch("twi.app.create_in_memory_repository", return_value=mock_repo):
        app = create_app(settings)
        with TestClient(app):
            time.sleep(0.05)

    purge_records = [json.loads(line) for line in log_capture.formatted]
    purge_entries = [r for r in purge_records if r.get("event") == "purge"]
    assert purge_entries, "expected at least one purge log entry"
    entry = purge_entries[0]
    for field in ("timestamp", "level", "event"):
        assert field in entry
    assert entry["level"] == "INFO"
