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
- [x] `T-01 test_create_app_returns_fastapi_with_routes_mounted`
- [x] `T-02 test_healthz_returns_ok`
- [x] `T-03 test_cors_header_on_allowed_origin`
- [x] `T-04 test_cors_header_absent_on_disallowed_origin`
- [x] `T-05 test_upload_size_middleware_returns_413_over_limit` (fichero dummy grande)
- [x] `T-06 test_purge_task_runs_on_schedule` (usa clock/scheduler mockeado)
- [x] `T-07 test_items_endpoint_returns_503_when_catalog_unavailable` (iter-07)
- [x] `T-07b test_get_item_endpoint_returns_503_when_catalog_unavailable` (iter-07)
- [x] `T-08 test_request_id_header_generated_when_absent` (iter-07)
- [x] `T-09 test_request_id_header_respected_from_client` (iter-07)
- [x] `T-10 test_access_log_is_valid_json_with_required_fields` (iter-07)
- [x] `T-10b test_access_log_includes_error_code_on_failure` (iter-07)
- [x] `T-11 test_purge_loop_emits_json_log` (iter-07)
- [x] `T-12 test_malformed_content_length_returns_400` (IT-04)
- [x] `T-13 test_unhandled_error_response_has_request_id_and_no_error_code_header` (IT-04)
- [x] `T-14 test_purge_logs_only_when_purged` (IT-04)

## 7. Notas de implementación
- Preferir `FastAPI(lifespan=...)` para arrancar/parar el task de purga.
- Las settings se leen vía `pydantic-settings` desde env con prefijo `TWI_`.
- `__main__` levanta uvicorn: `uvicorn twi.app:create_app --factory --host 0.0.0.0 --port 8000`.

## 8. Performance
- Coste de arranque < 1 s. Si `item-catalog` se carga desde cache JSON, mantenerlo perezoso.

## 9. Errores
- Fallo cargando cache de ítems → log warning; el endpoint `/api/items` devolverá 503 hasta que exista.

## 10. Estado
- **Versión del contrato**: v0.1.3
- **Último cierre**: 2026-07-16 (IT-04, PLAN_REMEDIACION E13+E20+M03+D05+P08)
- **Iteración actual**: cerrada

### 10.0. Cambios v0.1.3 (IT-04)

- E13 — `_UploadSizeLimitMiddleware` parsea `Content-Length` con try/except:
  un header malformado (`banana`) responde 400 `validation_error` en vez de
  propagar `ValueError` → 500.
- E20 — el handler de `Exception` (en `twi/api_rest/errors.py`, corre en
  `ServerErrorMiddleware`, **fuera** de `RequestContextMiddleware`) ahora
  consume él mismo el header transitorio `X-Error-Code` y añade `X-Request-Id`
  desde `request.state.request_id`: los 500 no controlados ya no filtran
  `X-Error-Code` al cliente y sí llevan el id de correlación.
- M03 — eliminado el ContextVar `current_request_id` (`observability.py`):
  se escribía en cada request pero nadie lo leía. `request.state.request_id`
  sigue siendo el mecanismo de propagación.
- D05 — `ERROR_CODE_HEADER` (y `REQUEST_ID_HEADER`) tienen ahora una única
  definición en `twi.api_rest.errors`; `observability.py` las importa de ahí
  (B6 depende de B5: dirección permitida).
- P08 — el purge loop solo emite log cuando `purge_expired()` purga > 0
  mundos (antes logueaba cada ciclo aunque purgara 0).

### 10.1. Cambios IT-00A (solo tests)

- `T-01` reescrito: FastAPI 0.139 representa los routers incluidos como
  `_IncludedRouter` sin `.path`, rompiendo la introspección de `app.routes`.
  El test ahora verifica el montaje con peticiones reales vía `TestClient`
  (`GET /healthz` → 200, `POST /api/worlds` sin body → 422,
  `GET /api/items?q=x` → 200/503). Sin cambio de contrato ni de código fuente.

### 10.2. Cambios v0.1.2 (iter-07)

- `RequestContextMiddleware` (en `twi/observability.py`): asigna `X-Request-Id`
  (UUID v4) por request si no llega del cliente; respeta el id entrante si viene
  con forma de UUID. Propaga el id a `request.state.request_id` y al header de
  respuesta. Cubre SP-04.
- `JsonFormatter` + `configure_logging(level)`: handler único en el root logger
  con salida JSON line. Campos: `timestamp`, `level`, `logger`, `message`,
  `request_id`, `method`, `path`, `status`, `duration_ms`, `event`,
  `error.code` (si aplica), `exc_info` (si aplica). Sin dependencias externas.
- Loggers nombrados:
  - `twi.access` — entrada por request (`message = "request_completed"` /
    `"request_failed"`).
  - `twi.purge` — entrada por ciclo de purga (`message = "purge_expired"`,
    `event = "purge"`, `status = <count>`).
- Header transitorio `X-Error-Code` añadido por `error_response` (B5) y
  consumido/eliminado por el middleware de contexto antes de devolver la
  respuesta al cliente; permite enriquecer el access log con `error.code`
  sin acoplar B5 al logger.

## 11. Decisiones tomadas en iter-006

- `purge_interval_seconds: int = 60` añadido a `Settings` para hacer T-06 testeable sin
  parchear `asyncio.sleep`: el test usa `purge_interval_seconds=0` + `time.sleep(0.05)`.
- `_NullCatalog` definido en `app.py` (implementa el Protocol `ItemCatalog`) para que el
  arranque no falle cuando `item_cache_path` no existe. El comportamiento vigente lanza
  `ItemCatalogUnavailableError` para que B5 responda 503 `catalog_unavailable`.
- `_UploadSizeLimitMiddleware(BaseHTTPMiddleware)` comprueba el header `Content-Length`
  antes de que cualquier router lea el body. Si no hay `Content-Length` (chunked), pasa;
  el router de B5 ya limita el tamaño al leer el fichero.
- CORS añadido como middleware exterior (se añade después del size-limit para que
  Starlette lo coloque más al exterior → los errores 413 también llevan cabecera CORS).
- `__main__` levanta uvicorn con `--factory` para que cada worker llame `create_app()`.
- `_LOG_LEVELS` dict evita `getattr(logging, ...)` que devolvería `Any` bajo mypy --strict.

## 12. Deuda / follow-ups

- Ninguna activa.
