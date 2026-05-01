# Módulo `B4 – tile-search`

## 1. Propósito
Motor de búsqueda sobre un `World` ya parseado. Dado un `item_id`, devuelve todas las coordenadas donde aparece: como bloque, como pared o dentro de contenedores (chests / dressers…).

## 2. Contrato público

```python
@dataclass(frozen=True)
class SearchMatch:
    x: int
    y: int
    source: Literal["block", "wall", "chest", "object"]
    chest_id: int | None = None
    stack: int | None = None

@dataclass(frozen=True)
class SearchResult:
    item_id: int
    total: int
    matches: tuple[SearchMatch, ...]

class TileSearchEngine(Protocol):
    def search(
        self,
        world: World,
        item_id: int,
        include_containers: bool = True,
    ) -> SearchResult: ...

def create_tile_search_engine(
    item_to_tile_mapping: Mapping[int, int] | None = None,
    item_to_wall_mapping: Mapping[int, int] | None = None,
) -> TileSearchEngine: ...
```

## 3. Dependencias
- `B1 wld-parser` (solo tipos de dominio).
- Stdlib.

## 4. No objetivos
- No devuelve píxeles ni se mete con el renderer.
- No hace caching entre llamadas (eso se puede añadir fuera si se requiere).
- No contempla "ítems equivalentes" (ej. distintos tipos de madera), solo coincidencia exacta por id.

## 5. Especificación (SDD)
- **SP-01** Si el `item_id` tiene entrada en `item_to_tile_mapping`, todas las celdas del grid cuyo `tile_id` coincida con `item_to_tile_mapping[item_id]` aparecen como `source="block"`. Sin entrada → sin matches de bloque.
- **SP-02** Si el `item_id` tiene entrada en `item_to_wall_mapping`, todas las celdas cuyo `wall_id` coincida con `item_to_wall_mapping[item_id]` aparecen como `source="wall"`. Sin entrada → sin matches de pared. (La comparación directa `item_id == wall_id` fue eliminada en iter-005: ítem y pared viven en espacios de ID distintos en Terraria.)
- **SP-03** Cada slot de cada `Chest` con `item_id` coincidente produce un `SearchMatch` en la posición `(chest.x, chest.y)` con `source="chest"`, `chest_id` y `stack`.
- **SP-04** Con `include_containers=False`, se omiten los matches de contenedores.
- **SP-05** `total == len(matches)`.
- **SP-06** Si no hay matches, `SearchResult(item_id, 0, ())`.
- **SP-07** Es **puro**: no muta `world` ni caches compartidas.
- **SP-08** Dos chests apilados (misma x,y) con el mismo ítem generan dos matches distintos.

## 6. Plan de tests (TDD)
- [x] `T-01 test_search_finds_block_matches`
- [x] `T-02 test_search_finds_wall_matches`
- [x] `T-03 test_search_finds_chest_items`
- [x] `T-04 test_search_without_containers_excludes_chest_matches`
- [x] `T-05 test_search_returns_empty_when_no_matches`
- [x] `T-06 test_search_total_matches_len_matches`
- [x] `T-07 test_search_is_pure_and_deterministic`
- [x] `T-08 test_search_large_world_completes_within_budget` (marca `@pytest.mark.perf`)
- [x] `test_search_stacked_chests_produce_distinct_matches` (SP-08, extra)

## 7. Notas de implementación
- Dos mappings separados: `item_to_tile_mapping: dict[int, int]` e `item_to_wall_mapping: dict[int, int]`. Ambos se inyectan al factory. Ítem y `tile_id`/`wall_id` viven en espacios distintos en Terraria; no se puede asumir identidad directa.
- Carga por defecto desde `data/item_world_map.json` (sección `"tiles"` y `"walls"`). Solo si ambos parámetros son `None` se carga el JSON; si alguno se pasa explícitamente, no se toca el fichero. El fichero `item_tile_map.json` queda obsoleto y puede eliminarse en una limpieza futura.
- Mappings verificados en `item_world_map.json`: Dirt Block (2→0), Stone Block (3→1), Torch (8→4). Sección `"walls"` vacía hasta confirmar IDs con fuente documentada.
- Iteración del grid: un solo paso O(W·H) con short-circuit por `None`; block y wall se computan en el mismo bucle.
- Los matches se devuelven ordenados por `(y, x)` para orden consistente en el frontend.

## 8. Performance
- Target: world large (8400×2400 ≈ 20M tiles) + 1000 chests < 500 ms.
- Representación vectorizada (numpy) opcional: `np.where(tile_ids == target)` acelera el paso de grid.

## 9. Errores
- Ninguna excepción específica. Item id inexistente → resultado vacío (no es error del motor).

## 10. Estado
- **Versión del contrato**: v2
- **Último cierre**: 2026-05-01
- **Iteración actual**: cerrada
- **Nota de cierre**: fix tipado redefinición en `create_tile_search_engine`.
- **Deuda / follow-ups**:
  - **VERIFY-EXT-01** — La suite completa `pytest` sigue fallando fuera de B4:
    permisos de `tmp_path` en tests de `item_catalog`/integración y tests reales de `wld-parser`
    sobre un mundo v319 no soportado (B1 soporta v230-v279). No se toca en esta iteración.
  - **FORMAT-EXT-01** — `ruff format src/ tests/ --check` detecta formato pendiente en
    `tests/unit/world_repository/test_world_repository.py`. No se toca en esta iteración por pertenecer a B2.
  - **PERF-01** — El loop O(W·H) sobre `list[list[Tile]]` alcanza ~2.3 s en CPython 3.14 para un
    mundo Large (20 M tiles). RNF-03 (< 500 ms) requiere vectorización numpy. Solución propuesta:
    exponer en B1 (`TileGrid`) arrays numpy cacheados (`tile_ids: np.ndarray`, `wall_ids: np.ndarray`)
    o agregar una utilidad `to_arrays() -> tuple[NDArray, NDArray]`; el motor usaría `np.where` en
    lugar del loop Python. No se toca en esta iteración (cambio de contrato en B1).
  - **WALL-IDS** — Sección `"walls"` de `item_world_map.json` está vacía. Añadir mappings
    `item_id → wall_id` verificados con fuente documentada (wiki.gg u offset en `.wld`).
    Stone Wall (item 26) y Dirt Wall (item 30) son los candidatos inmediatos.
  - **STALE-JSON** — `data/item_tile_map.json` queda sin uso. Puede eliminarse en limpieza futura.

### Evolución propuesta para paridad con TerraMap

Referencia local acotada:
- `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io\resources\js\main.js`
  - leer solo `addTileSelectOptions`, `addItemSelectOptions`, `addWallSelectOptions`, `isTileMatch`, `highlightInfos`, `getTileInfoFrom`, `getSelectedInfos`.
- `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io\resources\js\settings.js`
  - leer solo las estructuras `Tiles`, `Items`, `Walls` necesarias para entender ids, frames y nombres.

Brechas actuales:
- `item_world_map.json` contiene solo tres mappings de bloque y ningún mapping de pared.
- El motor solo soporta un `tile_id` o `wall_id` por item; TerraMap distingue frames/variantes mediante `U/V`.
- `source="object"` existe en el tipo pero no se produce porque B1 no expone tile entities.
- La búsqueda en contenedores cubre chests, pero no objetos con inventario fuera de chests.

Contrato propuesto v3 (depende de B1 v2):
- permitir mappings con condiciones opcionales de frame: `item_id -> [{ kind:"tile", tile_id, frame_x?, frame_y? }, { kind:"wall", wall_id }]`.
- buscar en `World.tile_entities` y devolver `SearchMatch(source="object", tile_entity_id=...)` con coordenadas de la entidad.
- ampliar firma: `search(world, item_id, include_containers=True, frame_x=None, frame_y=None)`. Si `frame_x/frame_y` se pasan, filtrar matches `source="block"` por igualdad exacta del frame.
- generar o versionar `item_world_map.json` desde una fuente verificable, no mantenerlo manualmente con tres entradas.

Semántica de `include_containers` (v3):
- `True` (default): incluye `source="chest"` **y** `source="object"` (tile entities con inventario: item frames, weapon racks, mannequins, hat racks).
- `False`: excluye `chest` **y** `object`. Bloque y pared nunca se ven afectados.
- Razón: para el caso de uso "¿dónde dejé X?" ambos son contenedores semánticamente equivalentes. Si en el futuro se necesita granularidad, añadir `include_chests`/`include_objects` como flags adicionales sin romper el default.

Tests mínimos futuros:
- item con mapping por `tile_id` simple.
- item con mapping por `tile_id + frame_x/frame_y` que no confunda variantes.
- item con mapping de pared.
- item dentro de item frame/weapon rack produce `source="object"` con `tile_entity_id`.
- item dentro de mannequin/hat rack produce `source="object"` y respeta stacks/prefix cuando existan.
- `include_containers=False` oculta `chest` y `object`, conserva `block` y `wall`.
- `frame_x=18, frame_y=0` filtra correctamente un mapping `tile_id` ambiguo (variantes de muebles).

Estado: planificado, no implementado.

## 11. Decisiones tomadas en iter-004 y iter-005
- **Wall search via `item_to_wall_mapping`** (iter-005): la comparación directa `item_id == wall_id`
  producía resultados incorrectos porque ítem y pared viven en espacios de ID distintos en Terraria.
  Se sustituyó por lookup explícito en `item_to_wall_mapping`, igual que bloques con `item_to_tile_mapping`.
- **`item_world_map.json`** (iter-005): nuevo fichero unificado con secciones `"tiles"` y `"walls"`.
  Solo mappings verificados: 2→0, 3→1, 8→4. Mappings erróneos `9→1` y `30→7` eliminados.
- **Budget de T-08 = 3.5 s**: el loop Python mide ~2.3 s; se usa margen 1.5× para varianza de CI.
  El test sirve como guardia de regresión, no como gate estricto de RNF-03.
- **Módulo de dominio puro**: cero imports de FastAPI/pydantic; todos los modelos son `dataclass`.
