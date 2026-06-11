#!/usr/bin/env bash
# T-01: smoke test — build, up, verify, down
set -euo pipefail

COMPOSE="docker compose -f docker/docker-compose.yml"
BASE="http://localhost:${PORT:-8080}"
TIMEOUT=90
FIXTURE="docker/smoke_world.wld"

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
    $COMPOSE logs
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

echo "==> T-01e: GET /api/items?q= (empty query) → expect 200"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/items?q=")
[ "$STATUS" = "200" ] || fail "GET /api/items?q=" "$STATUS"
echo "     OK ($STATUS)"

if [ ! -f "$FIXTURE" ]; then
    echo "WARN: fixture $FIXTURE not found — skipping T-01f..T-01j (generate with: cd backend && python -c 'import sys; sys.path.insert(0,\"tests\"); sys.path.insert(0,\"src\"); from fixtures.wld_builder import build_world; open(\"../docker/smoke_world.wld\",\"wb\").write(build_world())')"
else
    echo "==> T-01f: POST /api/worlds with fixture → expect 200, capture world_id"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -F "file=@${FIXTURE};type=application/octet-stream" \
        "$BASE/api/worlds")
    BODY=$(echo "$RESPONSE" | head -n -1)
    STATUS=$(echo "$RESPONSE" | tail -n 1)
    [ "$STATUS" = "200" ] || fail "POST /api/worlds with fixture" "$STATUS"
    WORLD_ID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['world_id'])" "$BODY" 2>/dev/null || echo "")
    [ -n "$WORLD_ID" ] || { echo "FAIL: could not extract world_id from response: $BODY"; $COMPOSE down -v; exit 1; }
    echo "     OK ($STATUS) world_id=$WORLD_ID"

    echo "==> T-01g: GET /api/worlds/$WORLD_ID/tiles → expect 200"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/worlds/$WORLD_ID/tiles")
    [ "$STATUS" = "200" ] || fail "GET /api/worlds/$WORLD_ID/tiles" "$STATUS"
    echo "     OK ($STATUS)"

    echo "==> T-01h: GET /api/worlds/$WORLD_ID/npcs → expect 200"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/worlds/$WORLD_ID/npcs")
    [ "$STATUS" = "200" ] || fail "GET /api/worlds/$WORLD_ID/npcs" "$STATUS"
    echo "     OK ($STATUS)"

    echo "==> T-01i: DELETE /api/worlds/$WORLD_ID → expect 204"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/worlds/$WORLD_ID")
    [ "$STATUS" = "204" ] || fail "DELETE /api/worlds/$WORLD_ID" "$STATUS"
    echo "     OK ($STATUS)"

    echo "==> T-01j: GET /api/worlds/$WORLD_ID after delete → expect 404"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/worlds/$WORLD_ID")
    [ "$STATUS" = "404" ] || fail "GET /api/worlds/$WORLD_ID (post-delete)" "$STATUS"
    echo "     OK ($STATUS)"
fi

echo "==> Tearing down..."
$COMPOSE down -v

echo ""
echo "All smoke tests passed."
