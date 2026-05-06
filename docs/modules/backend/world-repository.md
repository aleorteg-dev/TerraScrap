# Módulo `B2 – world-repository`

## 1. Propósito
Guardar mundos parseados en memoria, asociados a un `world_id` (UUID). Gestiona TTL y limpieza. Es la "sesión" del sistema sin base de datos.

## 2. Contrato público

```python
class WorldRepository(Protocol):
    def store(self, world: World) -> str: ...                  # devuelve world_id (uuid4 string)
    def get(self, world_id: str) -> World: ...                 # lanza WorldNotFoundError si no existe o TTL expirado
    def delete(self, world_id: str) -> None: ...               # idempotente
    def delete_strict(self, world_id: str) -> None: ...        # lanza WorldNotFoundError si id ausente o expirado
    def touch(self, world_id: str) -> None: ...                # renueva TTL
    def purge_expired(self, now: datetime | None = None) -> int: ...  # devuelve n purgados

class WorldNotFoundError(Exception): ...

def create_in_memory_repository(
    ttl_seconds: int = 1800,
    clock: Callable[[], datetime] = datetime.utcnow,
) -> WorldRepository: ...
```

## 3. Dependencias
- `B1 wld-parser` únicamente para el tipo `World`.
- Stdlib: `uuid`, `datetime`, `threading` (lock para thread safety del dict).

## 4. No objetivos
- No persiste a disco.
- No serializa a JSON (eso es `api-rest`).
- No conoce HTTP.

## 5. Especificación (SDD)
- **SP-01** `store` devuelve un UUID v4 único por cada llamada.
- **SP-02** `get` devuelve el mismo objeto `World` almacenado si no ha expirado.
- **SP-03** `get` sobre un id inexistente lanza `WorldNotFoundError`.
- **SP-04** Tras `ttl_seconds` sin `touch`, `get` lanza `WorldNotFoundError` y el slot queda marcado para purga.
- **SP-05** `touch` renueva el TTL.
- **SP-06** `purge_expired` elimina entradas caducadas y devuelve la cuenta.
- **SP-07** Es thread-safe para `store`/`get`/`delete` concurrentes (ok si se protege con lock).

## 6. Plan de tests (TDD)
- [x] `T-01 test_store_returns_unique_uuid_per_call`
- [x] `T-02 test_get_returns_stored_world`
- [x] `T-03 test_get_unknown_id_raises_world_not_found_error`
- [x] `T-04 test_get_after_ttl_expires_raises_world_not_found_error` (usa `clock` inyectado)
- [x] `T-05 test_touch_extends_ttl`
- [x] `T-06 test_delete_is_idempotent`
- [x] `T-07 test_purge_expired_removes_only_expired_entries`
- [x] `T-08 test_concurrent_store_and_get_is_safe` (threads)
- [x] `T-09 test_delete_strict_removes_existing_world` (iter-032)
- [x] `T-09b test_delete_strict_raises_on_unknown_id` (iter-032)
- [x] `T-09c test_delete_strict_raises_on_expired_world` (iter-032)

## 7. Notas de implementación
- Implementación base: `dict[str, tuple[World, datetime]]` + `threading.RLock`.
- Inyectar un `clock` callable para testear expiraciones sin `sleep`.
- El `purge_expired` puede arrancarse opcionalmente por un `asyncio` task en `app-bootstrap`, pero el módulo no asume ese runner.

## 8. Performance
- O(1) en `store`/`get`/`delete`.
- `purge_expired` O(n) sobre entradas vivas. Aceptable para n < 10 000 sesiones.

## 9. Errores
- `WorldNotFoundError` con atributo `world_id: str`.

## 10. Estado
- **Versión del contrato**: v1.1
- **Último cierre**: 2026-05-06 (iter-032)
- **Iteración actual**: cerrada

### Decisiones tomadas
- `get` renueva `last_accessed` al leer (comportamiento de caché de sesión; `touch` existe para heartbeat sin payload).
- `touch` lanza `WorldNotFoundError` si la entrada está expirada o no existe.
- Clock inyectado como `Callable[[], datetime]`; default `_utcnow` usa `datetime.now(UTC)` (evita `utcnow` deprecado en Python 3.12+).
- Nombres de tests adaptados a N802 (ruff): `WorldNotFoundError` → `world_not_found_error` en el nombre de función.
- `delete_strict` (iter-032): lanza `WorldNotFoundError` si el id no existe o ha expirado; elimina en un único lock. Usa el router DELETE para eliminar el `get()+delete()` antipattern anterior.

### Deuda / follow-ups
- `purge_expired` no se auto-ejecuta; `app-bootstrap` (B6) lo arranca periódicamente vía lifespan task (ya implementado).