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

- [ ] `T-01 test_post_world_returns_world_id_and_metadata`
- [ ] `T-02 test_post_world_too_large_returns_413`
- [ ] `T-03 test_post_world_invalid_bytes_returns_400`
- [ ] `T-04 test_post_world_unsupported_version_returns_422`
- [ ] `T-05 test_get_world_unknown_id_returns_404`
- [ ] `T-06 test_search_endpoint_returns_matches`
- [ ] `T-07 test_search_endpoint_missing_item_id_returns_400`
- [ ] `T-08 test_items_search_endpoint_returns_limited_results`
- [ ] `T-09 test_delete_world_returns_204`
- [ ] `T-10 test_delete_world_unknown_id_returns_404`
- [ ] `T-11 test_every_response_includes_api_version_header`
- [ ] `T-12 test_openapi_schema_snapshot` (compara contra fichero checked-in)

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
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —