# Módulo `B5 – api-rest`

## 1. Propósito
Exponer vía HTTP/JSON (FastAPI) las capacidades de los módulos de dominio (`world-repository`, `item-catalog`, `tile-search`) siguiendo `docs/contracts/api-contract.md`. Convierte entre DTOs y objetos de dominio. No contiene lógica de negocio nueva.

## 2. Contrato público

```python
# src/twi/api_rest/router.py
def create_router(
    repo: WorldRepository,
    catalog: ItemCatalog,
    search: TileSearchEngine,
    parser: Callable[[bytes], World] = parse_wld_bytes,
    max_upload_mb: int = 200,
) -> APIRouter: ...
```

DTOs (pydantic v2) definidos en `src/twi/api_rest/schemas.py`:
- `WorldCreatedDto`, `WorldMetadataDto`, `TilesChunkDto`, `SearchResultDto`, `SearchMatchDto`, `ItemSummaryDto`, `ItemDetailDto`, `ErrorDto`.

## 3. Dependencias
- `B2 world-repository`
- `B3 item-catalog`
- `B4 tile-search`
- `B1 wld-parser` solo para `parse_wld_bytes`.
- Externas: `fastapi`, `pydantic>=2`, `python-multipart`.

## 4. No objetivos
- No levanta el servidor (`uvicorn` vive en `app-bootstrap`).
- No implementa auth.
- No crea el clock/TTL ni el caché; solo lo usa.

## 5. Especificación (SDD)
- **SP-01** `POST /api/worlds` con multipart válido → 200 y `world_id`.
- **SP-02** `POST /api/worlds` con fichero > `max_upload_mb` → 413 con `code:"file_too_large"`.
- **SP-03** `POST /api/worlds` con bytes que no son `.wld` válido → 400 `code:"invalid_wld"`.
- **SP-04** `POST /api/worlds` con versión no soportada → 422 `code:"unsupported_version"`, `details.version`.
- **SP-05** `GET /api/worlds/{id}` inexistente → 404 `code:"world_not_found"`.
- **SP-06** `GET /api/worlds/{id}/search?item_id=X` → SearchResultDto.
- **SP-07** `GET /api/worlds/{id}/search` sin `item_id` → 400 `code:"invalid_item_id"`.
- **SP-08** `GET /api/items?q=zen` → lista con ≤ 20 `ItemSummaryDto` por defecto.
- **SP-09** `GET /api/items/{id}` → `ItemDetailDto` o 404.
- **SP-10** `DELETE /api/worlds/{id}` → 204; repetido sobre id inexistente → 404.
- **SP-11** Todas las respuestas incluyen header `X-API-Version: v0.1.0`.
- **SP-12** El schema OpenAPI generado por FastAPI coincide con `docs/contracts/api-contract.md` (snapshot test).

## 6. Plan de tests (TDD)
Usar `TestClient` de FastAPI con repos/catálogos *fake* (in-memory, sin red).

- [x] `T-01 test_post_world_returns_world_id_and_metadata`
- [x] `T-02 test_post_world_too_large_returns_413`
- [x] `T-03 test_post_world_invalid_bytes_returns_400`
- [x] `T-04 test_post_world_unsupported_version_returns_422`
- [x] `T-05 test_get_world_unknown_id_returns_404`
- [x] `T-06 test_search_endpoint_returns_matches`
- [x] `T-07 test_search_endpoint_missing_item_id_returns_400`
- [x] `T-08 test_items_search_endpoint_returns_limited_results`
- [x] `T-09 test_delete_world_returns_204`
- [x] `T-10 test_delete_world_unknown_id_returns_404`
- [x] `T-11 test_every_response_includes_api_version_header`
- [x] `T-12 test_openapi_schema_snapshot` (compara contra fichero checked-in)

## 7. Notas de implementación
- Usa un `APIRouter` con prefijo `/api`. El montaje ocurre en `app-bootstrap`.
- Inyección de dependencias mediante `Depends(lambda: repo)` creadas por el factory. No usar singletons globales.
- Mapeo de excepciones de dominio → HTTP en un `exception_handler` local:
  - `WldParseError` → 400
  - `UnsupportedWorldVersionError` → 422
  - `WorldNotFoundError` → 404
  - `ItemNotFoundError` → 404
  - Cualquier otra → 500 genérica.

## 8. Performance
- La construcción del `TilesChunkDto` debe evitar copiar el grid entero: usa la codificación definida en `wld-parser` (RLE base64).

## 9. Errores
Forma única: `{"error": {"code": str, "message": str, "details": dict | None}}`.

## 10. Estado
- **Versión del contrato**: v0.1.0
- **Último cierre**: 2026-04-27 (iter-005) — reabierto y cerrado 2026-04-27 (bugfix) — reabierto y cerrado 2026-04-27 (bugfix chunk-index)
- **Iteración actual**: cerrada

## 11. Decisiones tomadas en iter-005

- `response_model=None` en todos los endpoints: FastAPI ≥ 0.111 con Python 3.14 rechaza
  `PydanticModel | JSONResponse` como union de respuesta. Se retorna `JSONResponse` siempre
  y se documenta el schema de éxito vía el parámetro `responses={}` del decorador.
- `_ok()` helper centraliza la serialización de DTOs de éxito con header `X-API-Version`.
- `_err()` helper centraliza los errores; usa `Mapping[str, object]` para `details`
  (covariant) en lugar de `dict` (invariant) para cumplir mypy --strict sin `Any` explícito.
- `_OkDto` type alias (union) evita línea larga en la firma de `_ok()`.
- `DELETE /api/worlds/{id}` llama `repo.get()` antes de `repo.delete()` porque el contrato
  de `WorldRepository.delete()` no lanza `WorldNotFoundError` (silencia el key faltante).
  Se anotó en deuda que sería más limpio añadir `delete_strict` al repositorio.
- Encoding `base64-rle-v1` **spec confirmado y corregido (bugfix 2026-04-27)**:
  array plano fila-mayor (`y` outer, `x` inner), RLE sobre tile_id únicamente.
  Cada run: `(tileId: int16LE, count: uint16LE)` = 4 bytes. Aire → -1. Max run: 65535.
  La implementación anterior (7 bytes/run, columna-mayor) era incompatible con el decoder
  de F3 world-canvas → canvas en blanco. Arreglado en T-13.

## 13. Decisiones tomadas (bugfix chunk-index 2026-04-27)

- `_encode_chunk` interpretaba `chunk_x`/`chunk_y` como coordenadas absolutas de tile. Correcto: son **índices de chunk** (`start = cx * chunk_size`). La convención ya era correcta en el frontend (F3) y en la doc del contrato (implícita). Ahora explícita en `api-contract.md`.
- Extraído helper puro `_chunk_bounds(cx, cy, size, world_w, world_h) → (start_x, start_y, w, h)` para facilitar tests.
- Añadidos tests T-14 (index→tiles), T-15 (out-of-bounds→empty), T-16 (unit de `_chunk_bounds`).
- El test T-13 preexistente usaba `chunk_x=0, chunk_y=0`, lo que enmascaraba el bug (`0 × size = 0`).
- Deuda registrada en F3: viewport inicial arranca en (0,0) = cielo puro; fix en iteración F3.

## 12. Deuda / follow-ups

- **iter-006 (B6 app-bootstrap)**: añadir CORS, lifespan, settings, montar el router.
- **`WorldRepository.delete_strict`**: añadir método que lanza `WorldNotFoundError` si el
  id no existe, para eliminar el `get()+delete()` en el endpoint DELETE.
- **world-canvas.md spec sync (F3)**: el doc de F3 dice "Uint16Array" pero la implementación
  usa `Int16Array` (correcto para el chequeo `tileId < 0`). Actualizar en iteración F3.
- **wall_id / liquid / flags ausentes del payload**: encoding simplificado solo transmite
  tile_id. Si F3 necesita paredes o líquidos, revisar encoding en iteración futura.

### Evolución propuesta para paridad con TerraMap

El contrato HTTP actual es suficiente para el MVP, pero no para render tipo TerraMap ni para inspección de tiles.

DTOs nuevos para `v0.2.0` (ver `docs/contracts/api-contract.md` §4):
- `WorldMetadataDto` extendido: `spawn_x`, `spawn_y` (int), `world_surface_y`, `rock_layer_y`, `hell_layer_y` (float).
- `TilesChunkDto.encoding = "base64-rle-v2"` (8 bytes/tile: tile_id, wall_id, liquid_type, liquid_amount, frame_x_packed, flags). Mantener `base64-rle-v1` durante la transición.
- `TileDetailDto`: `{ x, y, tile_id, wall_id, liquid_type, liquid_amount, frame_x, frame_y, chest_id?, sign_id?, tile_entity_id? }`.
- `NpcSummaryDto`: `{ id, name, type, x, y }`. `NpcListDto`: `{ npcs: NpcSummaryDto[] }`.
- `SearchMatchDto` admite `tile_entity_id?: int` cuando `source="object"`.

Endpoints nuevos:
- `GET /api/worlds/{world_id}/tile?x=<int>&y=<int>` → `TileDetailDto`. 400 si coords inválidas, 404 si mundo no existe o fuera de grid.
- `GET /api/worlds/{world_id}/npcs` → `NpcListDto`. 404 si mundo no existe.

Cambios en endpoints existentes:
- `GET /api/worlds/{world_id}/search` admite `frame_x`, `frame_y` opcionales. Si presentes, filtra `source="block"` por igualdad exacta de frame. `include_containers=false` excluye **tanto `chest` como `object`**.

No objetivos de v0.2:
- Export PNG: se compone en frontend (F6) a partir de F3+F5; backend no lo expone.

Restricción: no cambiar API sin actualizar `docs/contracts/api-contract.md`, `docs/contracts/openapi.json`, `F1 api-client` y los tests snapshot. Mapeo de excepciones extendido:
- `TileEntityNotFoundError` (futuro) → 404 `code:"tile_entity_not_found"`.
- coordenadas fuera del grid → 400 `code:"invalid_coordinates"`.

Tests mínimos futuros:
- `T-13 GET /tile devuelve TileDetailDto con frame y tile_entity_id`.
- `T-14 GET /npcs devuelve lista vacía si el mundo no tiene NPCs`.
- `T-15 search con frame_x/frame_y filtra variantes`.
- `T-16 search con include_containers=false oculta chest y object`.
- `T-17 OpenAPI snapshot v0.2 actualizado`.

Estado: planificado, no implementado.
