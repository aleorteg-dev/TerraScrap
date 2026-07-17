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
    job_ttl_seconds: int = 900,
) -> APIRouter: ...
```

```python
# src/twi/api_rest/errors.py
def register_error_handlers(app: FastAPI) -> None: ...

class XApiVersionMiddleware(BaseHTTPMiddleware): ...
```

DTOs (pydantic v2) definidos en `src/twi/api_rest/schemas.py`:
- `WorldCreatedDto`, `WorldMetadataDto` (v0.2: `spawn_x`, `spawn_y`, `world_surface_y`, `rock_layer_y`, `hell_layer_y`), `TilesChunkDto` (v0.2: `encoding: Literal["base64-rle-v1", "base64-rle-v2"]`, `surface_y?: list[int]`), `SearchResultDto`, `SearchMatchDto`, `ItemSummaryDto`, `ItemDetailDto`, `ErrorDto`.
- v0.2 nuevos: `NpcDto`, `NpcListDto`, `TileDetailDto`. (`TileEntityDto` retirado en IT-03: nunca servido por ningún endpoint; reservado para v0.3 en api-contract §5.3.)

Contrato transversal de errores HTTP:
- `register_error_handlers(app)` registra handlers publicos para que `app-bootstrap` los monte.
- `RequestValidationError` -> 422 `ErrorDto`, `code:"validation_error"`, `details` es una lista normalizada de errores.
- `StarletteHTTPException` -> `ErrorDto` usando codigos de dominio cuando el status tiene canon definido (`413 -> upload_too_large`, `404 -> not_found` generico desde IT-03 — `world_not_found` lo emiten explicitamente los handlers de `/worlds/*`); si no hay canon, usa `http_error`.
- `Exception` no controlada -> 500 `ErrorDto`, `code:"internal_error"`, sin traza ni detalles internos.
- `XApiVersionMiddleware` añade `X-API-Version: 0.2` a toda respuesta, incluidas validacion, errores de framework y limite de upload.

Contrato vigente de `GET /api/worlds/{world_id}/tiles`:
- Query param `encoding`: `"base64-rle-v1"` (default) | `"base64-rle-v2"`. Otro valor → 400 `code:"invalid_encoding"`.
- `TilesChunkDto.encoding` es siempre el discriminador de la respuesta.
- `TilesChunkDto.surface_y` contiene el primer `y` de terreno/superficie que bloquea cielo por columna del chunk (ignora árboles, plantas, vines, saplings, objetos con `frame_x`/`frame_y` y demás foreground decorativo); el frontend lo usa para pintar cielo abierto en mundos con desniveles sin depender solo de `world_surface_y`.
- `payload` v1: `base64` de runs `(tileId:int16LE, count:uint16LE)`. Orden fila-mayor (y externo, x interno). Aire = `-1`.
- `payload` v2: `base64` de `HEADER (8B "TWv2" + frame_count u16LE + reserved u16LE)` + `RUNS (10B/run: tile_id i16, wall_id u16, liquid_type u8, liquid_amount u8, frame_x_hi u8, flags u8, count u16)` + `FRAME_BLOCK (6B/entrada: run_index u16, frame_x_lo u8, reserved u8=0, frame_y u16)`. flags bit 0 = `has_frame`; bits 1..5 (actuator/wires) reservados a 0 (deuda hasta decomposición de `Tile.flags`).
- `chunk_x` y `chunk_y` son índices de chunk; `start = index * chunk_size`.

Contrato vigente de import jobs (`POST /api/world-imports` + `GET /api/world-imports/{job_id}`):
- Un job en estado terminal (`done` | `error`) se retiene **`job_ttl_seconds` segundos**
  (default **900 s = 15 min**) desde que alcanzó el estado terminal. Consultar un job
  expirado (o purgado) → 404 `code:"job_not_found"`, indistinguible de un job que nunca
  existió. Los jobs `queued`/`processing` no expiran por este TTL.
- La purga es perezosa: se ejecuta en cada acceso al almacén de jobs (crear o consultar),
  por lo que el diccionario interno queda acotado sin necesidad de tarea de fondo.
- Cualquier excepción inesperada del parseo (distinta de `WldParseError` /
  `UnsupportedWorldVersionError`) deja el job en `status:"error"` con
  `error_code:"import_failed"` y un `error_message` genérico **sin traza ni detalles
  internos**; el detalle se loguea a `ERROR` en el servidor.

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
- **SP-02** `POST /api/worlds` con fichero > `max_upload_mb` → 413 con `code:"upload_too_large"`.
- **SP-03** `POST /api/worlds` con bytes que no son `.wld` válido → 400 `code:"invalid_wld"`, `details.parser_code` con el código de la excepción (`invalid_footer`, `corrupt`, `truncated`, etc.), logger WARNING con `exc.code` y `exc.details`.
- **SP-04** `POST /api/worlds` con versión no soportada → 422 `code:"unsupported_version"`, `details.version`.
- **SP-05** `GET /api/worlds/{id}` inexistente → 404 `code:"world_not_found"`.
- **SP-06** `GET /api/worlds/{id}/search?item_id=X` → SearchResultDto.
- **SP-07** `GET /api/worlds/{id}/search` sin `item_id` → 400 `code:"invalid_item_id"`.
- **SP-08** `GET /api/items?q=zen` → lista con ≤ 20 `ItemSummaryDto` por defecto.
- **SP-09** `GET /api/items/{id}` → `ItemDetailDto` o 404.
- **SP-10** `DELETE /api/worlds/{id}` → 204; repetido sobre id inexistente → 404.
- **SP-11** Todas las respuestas incluyen header `X-API-Version: 0.2`.
- **SP-12** El schema OpenAPI generado por FastAPI coincide con `docs/contracts/api-contract.md` (snapshot test).
- **SP-13** Todo 413 de upload usa `ErrorDto` y `code:"upload_too_large"`.
- **SP-14** El 413 producido por el router y el 413 producido por el limite de `app-bootstrap` devuelven el mismo `code`.
- **SP-15** La validacion FastAPI devuelve 422 `ErrorDto`, no `{ "detail": [...] }`.
- **SP-16** Un mundo inexistente devuelve 404 `ErrorDto` con header de version.
- **SP-17** Una excepcion no controlada devuelve 500 `ErrorDto` sin filtrar trazas.
- **SP-18** El header `X-API-Version` esta presente tambien en respuestas 2xx gestionadas por FastAPI.
- **SP-19** Una excepción inesperada durante un import job deja el job en `status:"error"` con `error_code:"import_failed"` y mensaje genérico sin traza (IT-01).
- **SP-20** Un import job en estado terminal expira a los `job_ttl_seconds` (default 900 s); consultarlo tras expirar devuelve 404 `job_not_found` (IT-01).
- **SP-21** El almacén interno de jobs queda acotado: los jobs terminales expirados se purgan en cada acceso (IT-01).
- **SP-22** Un 404 de ruta inexistente responde `code:"not_found"`; `world_not_found` solo lo emiten los handlers de `/worlds/*` (IT-03).
- **SP-23** `TileEntityDto` no forma parte del contrato público (`twi.api_rest.__all__`) (IT-03).

## 6. Plan de tests (TDD)
Usar `TestClient` de FastAPI con repos/catálogos *fake* (in-memory, sin red).

- [x] `T-01 test_post_world_returns_world_id_and_metadata`
- [x] `T-02 test_post_world_too_large_returns_413`
- [x] `T-03 test_post_world_invalid_bytes_returns_400`
- [x] `T-03b test_post_world_parse_error_includes_parser_code` (4 variantes: invalid_footer, corrupt, truncated, unsupported_version — verifica details.parser_code y caplog WARNING)
- [x] `T-04 test_post_world_unsupported_version_returns_422`
- [x] `T-05 test_get_world_unknown_id_returns_404`
- [x] `T-06 test_search_endpoint_returns_matches`
- [x] `T-07 test_search_endpoint_missing_item_id_returns_400`
- [x] `T-08 test_items_search_endpoint_returns_limited_results`
- [x] `T-09 test_delete_world_returns_204`
- [x] `T-10 test_delete_world_unknown_id_returns_404`
- [x] `T-11 test_every_response_includes_api_version_header`
- [x] `T-12 test_openapi_schema_snapshot` (compara contra fichero checked-in)
- [x] `T-13 test_get_tiles_payload_encodes_row_major_int16_rle`
- [x] `T-14 test_tiles_endpoint_chunk_index_maps_to_correct_tiles`
- [x] `T-15 test_tiles_endpoint_out_of_bounds_chunk_returns_empty`
- [x] `T-16 test_chunk_bounds_returns_correct_tile_range`
- [x] `T-17 test_get_tiles_endpoint_returns_canonical_encoding_base64_rle_v1`
- [x] `T-18 test_encode_chunk_round_trips_known_tiles_as_base64_rle_v1`
- [x] `T-19 test_413_upload_too_large_has_error_dto_shape`
- [x] `T-20 test_413_response_has_x_api_version_header`
- [x] `T-21 test_router_and_middleware_return_same_413_code`
- [x] `T-22 test_422_validation_returns_error_dto_not_detail`
- [x] `T-23 test_422_response_has_x_api_version_header`
- [x] `T-24 test_404_unknown_world_has_error_dto_and_version_header`
- [x] `T-25 test_500_unhandled_exception_returns_error_dto_without_traceback`
- [x] `T-26 test_x_api_version_header_present_on_2xx`
- [x] `T-27 test_items_returns_503_when_catalog_unavailable` (iter-032)
- [x] `T-28 test_get_item_by_id_returns_503_when_catalog_unavailable` (iter-032)
- [x] `T-29 test_get_tile_returns_full_detail_dto` (iter-09)
- [x] `T-30 test_get_tile_empty_coordinate_returns_nulls` (iter-09)
- [x] `T-31 test_get_tile_out_of_bounds_returns_400` (iter-09)
- [x] `T-32 test_get_tile_unknown_world_returns_404` (iter-09)
- [x] `test_chunk_surface_y_returns_first_active_tile_per_chunk_column` (fix cielo 2026-06-11)
- [x] `test_tiles_endpoint_includes_surface_y_for_open_sky_by_column` (fix cielo 2026-06-11)
- [x] `test_import_job_unexpected_exception_marks_job_error` (IT-01)
- [x] `test_import_jobs_expire_after_terminal_ttl` (IT-01)
- [x] `test_import_jobs_purge_bounded` (IT-01)
- [x] `test_unknown_route_returns_generic_not_found_code` (IT-03)
- [x] `test_tile_entity_dto_removed_from_public_contract` (IT-03)
- [x] `test_read_upload_capped_stops_reading_once_over_limit` (IT-05)
- [x] `test_read_upload_capped_returns_identical_bytes_within_limit` (IT-05)
- [x] `test_upload_world_413_without_consuming_whole_body` (IT-05)
- [x] `test_create_import_job_413_without_consuming_whole_body` (IT-05)

## 7. Notas de implementación
- Usa un `APIRouter` con prefijo `/api`. El montaje ocurre en `app-bootstrap`.
- Inyección de dependencias mediante `Depends(lambda: repo)` creadas por el factory. No usar singletons globales.
- Mapeo transversal de errores HTTP en `register_error_handlers(app)`:
  - `RequestValidationError` → 422 `validation_error`.
  - `UploadTooLargeError` → 413 `upload_too_large`.
  - `StarletteHTTPException` → `ErrorDto` con codigo canonico por status.
  - `Exception` → 500 `internal_error`.
- El mapeo `status_code -> code` vive en una constante o funcion pura del modulo `api_rest`; no duplicar literales en handlers.
- `app-bootstrap` solo registra handlers y middleware; no construye `ErrorDto`.

## 8. Performance
- La construcción del `TilesChunkDto` debe evitar copiar el grid entero: usa la codificación definida en `wld-parser` (RLE base64).

## 9. Errores
Forma única: `{"error": {"code": str, "message": str, "details": dict | list | None}}`.
Codigo canonico de 413: `upload_too_large`.
Validacion FastAPI: 422 `validation_error` con `details` como lista normalizada.
Errores 500: `internal_error` sin traceback ni detalles internos.

## 10. Estado
- **Versión del contrato**: v0.2 (cerrada — DELETE estricto, search con `frame_x/frame_y`, `X-API-Version: 0.2`, OpenAPI snapshot regenerado) + retención de import jobs (IT-01) + 404 genérico `not_found` y retirada de `TileEntityDto` (IT-03).
- **Último cierre**: 2026-07-17 (IT-13 remediación — P01 caché de `surface_y`)
- **Iteración actual**: cerrada

### 10.-1. Cambios IT-13 (P01, sin cambio de contrato)

- `GET /tiles` ya no recorre la columna completa del mundo en cada petición:
  el `surface_y` por columna se computa **una vez por mundo** con
  `_world_surface_y_by_column(tiles, world_surface_y)` (una pasada w·h) y se
  cachea en el closure del router (`OrderedDict[world_id, list[int]]`, LRU de
  `_SURFACE_CACHE_MAX_WORLDS = 4` mundos). Cada chunk toma su slice
  `[start_x : start_x + w]`. El mundo es inmutable en sesión → cacheable 100 %.
- `DELETE /worlds/{id}` invalida la entrada de la caché (además del desalojo
  LRU). Los payloads de `surface_y` son byte a byte idénticos a los previos
  (test de equivalencia contra `_chunk_surface_y` directo).
- `_chunk_surface_y` se conserva como función pura (tests unitarios de la
  heurística de islas/cañones); tanto ella como la versión mundo-entero
  delegan en `_column_surface_y` (fuente única del algoritmo por columna).

### 10.0. Cambios IT-05 (E12, sin cambio de contrato)

- `POST /worlds` y `POST /world-imports` leen el body con
  `_read_upload_capped(file, max_bytes)`: chunks de 1 MiB
  (`_UPLOAD_CHUNK_BYTES`) y corte en cuanto lo acumulado excede el límite
  (devuelve `None` → 413 `upload_too_large`, mismo mensaje que antes).
  Nunca se retienen más de `límite + 1 chunk` bytes, también en subidas
  chunked sin `Content-Length` (que eluden el middleware de B6).
- `_check_upload_size` (leía el body entero antes de comprobar) sustituido
  por `_read_upload_capped` + `_upload_too_large_response(max_upload_mb)`.

## 11. Decisiones tomadas en iter-005

- `response_model=None` en todos los endpoints: FastAPI ≥ 0.111 con Python 3.14 rechaza
  `PydanticModel | JSONResponse` como union de respuesta. Se retorna `JSONResponse` siempre
  y se documenta el schema de éxito vía el parámetro `responses={}` del decorador.
- `_ok()` helper centraliza la serialización de DTOs de éxito con header `X-API-Version`.
- `_err()` helper centraliza los errores; usa `Mapping[str, object]` para `details`
  (covariant) en lugar de `dict` (invariant) para cumplir mypy --strict sin `Any` explícito.
- `_OkDto` type alias (union) evita línea larga en la firma de `_ok()`.
- `DELETE /api/worlds/{id}` nació usando `repo.get()` antes de `repo.delete()` porque el contrato
  de `WorldRepository.delete()` no lanzaba `WorldNotFoundError`. El flujo vigente usa
  `repo.delete_strict()`.
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
- El bug complementario de viewport inicial en F3 quedó corregido en su iteración.

## 14. Decisiones tomadas (realineacion encoding 2026-04-30)

- Via A confirmada: el encoding canonico vigente sigue siendo `base64-rle-v1`.
- `base64-rle-v2` queda solo como evolucion propuesta de `v0.2.0`; no se promueve
  al contrato activo en esta iteracion.
- `api-rest` ya serializaba el endpoint `/tiles` como `base64-rle-v1`; se anadieron
  tests de regresion para fijar el campo `encoding` y el round-trip RLE.
- Se regenero `docs/contracts/openapi.json` desde `twi.app.create_app().openapi()`
  y `frontend/src/api-client/__generated__/schema.d.ts` con `openapi-typescript`.
- No queda deuda nueva de consumidores frontend para esta via: el consumidor vigente
  espera `base64-rle-v1`.

## 15. Decisiones tomadas (errores HTTP 2026-05-02)

- Codigo canonico de 413 fijado en `upload_too_large`; el router y el limite de
  tamano del bootstrap devuelven el mismo `code`.
- `register_error_handlers(app)` queda como contrato publico de B5 para registrar
  `RequestValidationError`, `UploadTooLargeError`, `StarletteHTTPException` y
  `Exception` no controlada.
- `XApiVersionMiddleware` queda como contrato publico de B5 y anade
  `X-API-Version` a respuestas 2xx, 4xx y 5xx, incluido el path de
  limite de upload. Valor inicial `v0.1.0`; promovido a `0.2` en iter-11.
- `ErrorDetailDto.details` admite `dict | list | None` para permitir la lista
  normalizada de errores de validacion FastAPI sin romper los detalles de dominio.
- Se regeneraron `docs/contracts/openapi.json` y el snapshot unitario de B5. No se
  tocaron los tipos generados de `frontend/src/api-client/__generated__/`.

## 12. Deuda / follow-ups

- **flags v2 actuator/wires**: encoder v2 sólo expone bit 0 (`has_frame`). Pendiente cuando `wld_parser` exponga campos discretos; F3 puede renderizar bits si llegan en el payload, pero B5 no debe inventarlos desde campos opacos.

### Evolución propuesta para paridad con TerraMap

**Documentada en contrato v0.2 (iter-01, 2026-05-06).**

Ver `docs/contracts/api-contract.md` §§2, 5 para el contrato oficial vigente. Resumen:

- `WorldMetadataDto` extendido: `spawn_x`, `spawn_y`, `world_surface_y`, `rock_layer_y`, `hell_layer_y` — §5.1.
- `base64-rle-v2` (10 bytes/run: tile_id, wall_id, liquid_type, liquid_amount, frame_x_hi, flags, count) + FRAME_BLOCK — §5.2.
- `TileDetailDto`, `NpcDto`, `NpcListDto`, `SearchMatchDto` extendido — §5.3.
- `GET /api/worlds/{world_id}/tile` y `GET /api/worlds/{world_id}/npcs` — §2.
- `GET /search` con `frame_x`/`frame_y` opcionales; `include_containers=false` excluye `object` — §1.1.

La implementación de todo lo anterior ocurre en **iter-011** (B5.1 api-rest v0.2).
OpenAPI y tipos frontend se regeneran en esa iteración.

## 16. Decisiones tomadas (iter-08, 2026-05-09)

- DTOs v0.2 añadidos: `WorldMetadataDto` extendido con `spawn_x`, `spawn_y`, `world_surface_y`, `rock_layer_y`, `hell_layer_y`; `NpcDto`, `NpcListDto`, `TileEntityDto`, `TileDetailDto`. `TilesChunkDto.encoding` ahora es `Literal["base64-rle-v1", "base64-rle-v2"]`.
- `_meta_dto` mapea los nuevos campos de `WorldMetadata` (defaults 0/0.0 preservan retrocompat de fixtures).
- Encoder `_encode_chunk_v2` implementa el spec del contrato v0.2 §5.2 byte a byte (HEADER "TWv2" + RUNS 10B + FRAME_BLOCK 6B). Endianness little. RLE agrupa tiles iguales en `(tile_id, wall_id, liquid_type, liquid_amount, frame_x, frame_y)`.
- `GET /api/worlds/{id}/tiles` acepta `?encoding=base64-rle-v1|base64-rle-v2`. Default `v1` (cliente vigente sigue esperando v1). Encoding desconocido → 400 `code:"invalid_encoding"`.
- `test_openapi_schema_snapshot` marcado `@pytest.mark.skip` durante iter-08 porque la regeneración del snapshot OpenAPI y `docs/contracts/openapi.json` está reservada a iter-011.
- Tests añadidos: round-trip v2 con tiles diversos (aire/stone/water/lava/framed), header-only en chunk vacío, snapshot bytes v1 sin drift, GET /tiles con v2/default/encoding desconocido, validación pydantic de los nuevos DTOs.

## 17. Decisiones tomadas (iter-09, 2026-05-09)

- Endpoint `GET /api/worlds/{world_id}/tile?x=&y=` añadido. Devuelve `TileDetailDto` con `chest_id` resuelto desde `World.chests` (campo `Chest.chest_id`), `sign_id` como índice 0-based en la tupla `World.signs` (el dataclass `Sign` no tiene id propio), y `tile_entity_id` desde `World.tile_entities`.
- 400 `coordinates_out_of_bounds` cuando `x<0 ∨ y<0 ∨ x>=width ∨ y>=height`, con `details: {x, y, width, height}`. Diverge del contrato §5.4 (`invalid_coordinates`) por instrucción explícita de la iteración.
- 404 `world_not_found` si `world_id` no existe.
- Mapping de tile vacío: cuando `Tile.tile_id is None`, todos los campos opcionales (`wall_id`, `frame_x`, `frame_y`) viajan tal cual (None si así fueron poblados); `liquid_type/amount` siempre presentes (default `"none"/0`).

## 18. Decisiones tomadas (IT-01 remediación, 2026-07-16)

- **E01 (leak de `jobs`)**: el `dict[str, _ImportJob]` del closure se sustituye por
  `_ImportJobStore` (privado del módulo), thread-safe (`threading.Lock`), con TTL de
  retención para jobs terminales y **purga perezosa** en cada `add()`/`get()`. Se eligió
  purga perezosa (y no el purge loop de B6) para no tocar otro módulo en esta iteración.
- **E02 (job colgado)**: `_do_import` añade `except Exception` final → log `ERROR` con
  `logger.exception` (traza solo en servidor) y estado terminal
  `error_code="import_failed"` con mensaje genérico fijo (`"Unexpected error during
  import."`); nunca se serializa `str(exc)` de excepciones no tipadas.
- `_ImportJob` gana `finished_at: datetime | None`, sellado con el clock inyectado en
  todos los caminos terminales (`done` y los tres `error`).
- `create_router` gana `job_ttl_seconds: int = 900` (público) y `_clock:
  Callable[[], datetime] | None = None` (inyección para tests, mismo patrón que B2).
- Sin cambios en el schema OpenAPI (`ImportJobStatusDto.error_code` ya era `str | None`),
  por lo que no se regeneran `openapi.json`/snapshot/tipos frontend.

## 19. Decisiones tomadas (IT-03 remediación, 2026-07-16)

- **E10**: `STATUS_CODE_TO_ERROR_CODE[404]` pasa de `"world_not_found"` a `"not_found"`.
  Los handlers de `/worlds/*` no se ven afectados: emiten `world_not_found`
  explícitamente vía `_get_world_or_404`/`delete_world`.
- **M01**: `TileEntityDto` eliminado de `schemas.py`, `__init__.py` y del contrato
  (marcado "reservado v0.3" en api-contract §5.3). No aparecía en el OpenAPI (ningún
  endpoint lo referenciaba), así que el schema no cambia.
- **M04**: eliminado el handler registrado de `UploadTooLargeError`: era inalcanzable
  porque `XApiVersionMiddleware.dispatch` captura la excepción antes de que llegue a los
  exception handlers. El 413 canónico lo sigue produciendo el middleware
  (`_upload_too_large_response`), verificado por T-19..T-21.
- **M19**: `_err` (alias trivial) eliminado; los handlers llaman a `error_response`
  directamente.
- **D03**: deduplicaciones sin cambio de comportamiento (protegidas por los tests
  existentes):
  - `_get_world_or_404(repo, world_id)` — lanza `HTTPException(404)` con detail
    estructurado `{code:"world_not_found", ...}` que `register_error_handlers` convierte
    en el mismo `ErrorDto` de siempre; sustituye el patrón try/except repetido ×5.
  - `_check_upload_size(data, max_upload_mb)` — check 413 único para `/worlds` y
    `/world-imports` (IT-05 lo reemplazará por lectura capada en streaming).
  - `_match_dto(m)` — constructor único de `SearchMatchDto` (antes ×2 en `search_world`).
  - `get_tiles` construye un único `TilesChunkDto` (encoder elegido por variable
    `Literal`) y llama a `_chunk_surface_y` una sola vez (antes duplicada en ambas ramas).
