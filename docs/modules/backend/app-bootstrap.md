# Módulo `B6 – app-bootstrap`

## 1. Propósito
Arrancar la aplicación FastAPI: configurar logging, CORS, límites, leer env vars, construir las instancias de `world-repository`, `item-catalog` y `tile-search`, y montar el router de `api-rest`. Es el único punto con "estado global" del proceso.

## 2. Contrato público

```python
# src/twi/app.py
def create_app(settings: Settings | None = None) -> FastAPI: ...

class Settings(BaseSettings):
    max_upload_mb: int = 200
    item_cache_path: Path = Path("data/items.json")
    world_ttl_seconds: int = 1800
    cors_origins: list[str] = ["http://localhost:5173"]
    log_level: str = "INFO"
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
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —