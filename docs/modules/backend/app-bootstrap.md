# Módulo `B6 – app-bootstrap`

## 1. Propósito
Arrancar la aplicación FastAPI: configurar logging, CORS, límites, leer env vars, construir las instancias de `world-repository`, `item-catalog` y `tile-search`, y montar el router de `api-rest`. Es el único punto con "estado global" del proceso.

## 2. Contrato público

```python
# src/twi/app.py
def create_app(settings: Settings | None = None) -> FastAPI: ...

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TWI_")

    max_upload_mb: int = 200
    item_cache_path: Path = Path("data/items.json")
    world_ttl_seconds: int = 1800
    cors_origins: list[str] = ["http://localhost:5173"]
    log_level: str = "INFO"
    purge_interval_seconds: int = 60   # intervalo del task de purga (testeable)
```

## 3. Dependencias
- `B2`, `B3`, `B4`, `B5`.
- Externas: `pydantic-settings`, `uvicorn` (solo en entrypoint `__main__`).

## 4. No objetivos
- No define endpoints.
- No implementa lógica de negocio.
- No conoce el formato `.wld`.

## 5. Especificación (SDD)
- **SP-01** `create_app()` devuelve una instancia `FastAPI` con todas las rutas documentadas montadas.
- **SP-02** CORS aplicado únicamente a los orígenes de `settings.cors_origins`.
- **SP-03** Se configura un task en background que llama `repo.purge_expired()` cada 60s.
- **SP-04** Logs en JSON (o texto claro en dev) con `request_id` por request.
- **SP-05** El limitador de tamaño (`max_upload_mb`) se aplica como middleware antes de parsing.
- **SP-06** Health check `GET /healthz` → 200 `{"status":"ok"}`.

## 6. Plan de tests (TDD)
- [ ] `T-01 test_create_app_returns_fastapi_with_routes_mounted`
- [ ] `T-02 test_healthz_returns_ok`
- [ ] `T-03 test_cors_header_on_allowed_origin`
- [ ] `T-04 test_cors_header_absent_on_disallowed_origin`
- [ ] `T-05 test_upload_size_middleware_returns_413_over_limit` (fichero dummy grande)
- [ ] `T-06 test_purge_task_runs_on_schedule` (usa clock/scheduler mockeado)

## 7. Notas de implementación
- Preferir `FastAPI(lifespan=...)` para arrancar/parar el task de purga.
- Las settings se leen vía `pydantic-settings` desde env con prefijo `TWI_`.
- `__main__` levanta uvicorn: `uvicorn twi.app:create_app --factory --host 0.0.0.0 --port 8000`.

## 8. Performance
- Coste de arranque < 1 s. Si `item-catalog` se carga desde cache JSON, mantenerlo perezoso.

## 9. Errores
- Fallo cargando cache de ítems → log warning; el endpoint `/api/items` devolverá 503 hasta que exista.

## 10. Estado
- **Versión del contrato**: v0.1.0
- **Último cierre**: 2026-04-26 (iter-006)
- **Iteración actual**: cerrada

## 11. Decisiones tomadas en iter-006

- `purge_interval_seconds: int = 60` añadido a `Settings` para hacer T-06 testeable sin
  parchear `asyncio.sleep`: el test usa `purge_interval_seconds=0` + `time.sleep(0.05)`.
- `_NullCatalog` definido en `app.py` (implementa el Protocol `ItemCatalog`) para que el
  arranque no falle cuando `item_cache_path` no existe; `search()` devuelve `[]` y `get()`
  lanza `ItemNotFoundError`. El 503 sobre `/api/items` cuando el catálogo no existe
  requeriría tocar `api_rest` → anotado en deuda.
- `_UploadSizeLimitMiddleware(BaseHTTPMiddleware)` comprueba el header `Content-Length`
  antes de que cualquier router lea el body. Si no hay `Content-Length` (chunked), pasa;
  el router de B5 ya limita el tamaño al leer el fichero.
- CORS añadido como middleware exterior (se añade después del size-limit para que
  Starlette lo coloque más al exterior → los errores 413 también llevan cabecera CORS).
- `__main__` levanta uvicorn con `--factory` para que cada worker llame `create_app()`.
- `_LOG_LEVELS` dict evita `getattr(logging, ...)` que devolvería `Any` bajo mypy --strict.

## 12. Deuda / follow-ups

- **503 en /api/items sin caché**: requiere que `api_rest.create_router` acepte un
  catalog opcional o que el router capture una nueva excepción `CatalogUnavailableError`.
  Anotar para iter-007 (si se necesita antes de F1).
- **Logging estructurado (JSON)**: SP-04 parcialmente cubierto (nivel configurable). El
  formato JSON + `request_id` por request queda fuera de esta iteración.
- **`WorldRepository.delete_strict`**: heredado de iter-005; sigue pendiente para el
  endpoint DELETE.