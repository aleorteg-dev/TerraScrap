#!/usr/bin/env bash
# T-01: smoke test — build, up, verify, down
set -euo pipefail

COMPOSE="docker compose -f docker/docker-compose.yml"
BASE="http://localhost:${PORT:-8080}"
TIMEOUT=90

echo "==> Building and starting compose..."
$COMPOSE up -d --build

echo "==> Waiting up to ${TIMEOUT}s for stack to be ready..."
deadline=$((SECONDS + TIMEOUT))
until curl -sf "$BASE/healthz" >/dev/null 2>&1; do
    if [ $SECONDS -ge $deadline ]; then
        echo "FAIL: stack not ready after ${TIMEOUT}s"
        $COMPOSE logs
        $COMPOSE down -v
        exit 1
    fi
    sleep 3
done

fail() {
    echo "FAIL: $1 — HTTP $2"
    $COMPOSE down -v
    exit 1
}

echo "==> T-01a: GET /healthz → expect 200"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/healthz")
[ "$STATUS" = "200" ] || fail "GET /healthz" "$STATUS"
echo "     OK ($STATUS)"

echo "==> T-01b: GET /api/items?q=dirt → expect 200"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/items?q=dirt")
[ "$STATUS" = "200" ] || fail "GET /api/items?q=dirt" "$STATUS"
echo "     OK ($STATUS)"

echo "==> T-01c: GET / → expect 200 (frontend index.html)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[ "$STATUS" = "200" ] || fail "GET /" "$STATUS"
echo "     OK ($STATUS)"

echo "==> T-01d: POST /api/worlds with no body → expect 422 (validation), not 5xx"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/worlds")
[[ "$STATUS" =~ ^4 ]] || fail "POST /api/worlds (validation check)" "$STATUS"
echo "     OK ($STATUS)"

echo "==> Tearing down..."
$COMPOSE down -v

echo ""
echo "All smoke tests passed."
