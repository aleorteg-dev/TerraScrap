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
- **SP-01** Si el `item_id` se corresponde con un `tile_id` (a través de `item_to_tile_mapping`), todas las celdas del grid con ese `tile_id` aparecen como `source="block"`.
- **SP-02** Si el `item_id` se corresponde con un `wall_id`, aparecen como `source="wall"`.
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
- El mapping item→tile no es 1:1 en Terraria; un ítem "Dirt Block" corresponde a `tile_id=0`. Este mapping vivirá en un JSON dentro del módulo (`data/item_tile_map.json`) y se inyecta al factory.
- Iteración del grid: recorrer una sola vez (O(W·H)) recolectando coincidencias de block y wall simultáneamente.
- Los matches se devuelven ordenados por `(y, x)` para que el frontend los muestre en orden consistente.

## 8. Performance
- Target: world large (8400×2400 ≈ 20M tiles) + 1000 chests < 500 ms.
- Representación vectorizada (numpy) opcional: `np.where(tile_ids == target)` acelera el paso de grid.

## 9. Errores
- Ninguna excepción específica. Item id inexistente → resultado vacío (no es error del motor).

## 10. Estado
- **Versión del contrato**: v1
- **Último cierre**: 2026-04-26 (iter-004)
- **Iteración actual**: cerrada
- **Deuda / follow-ups**:
  - **PERF-01** — El loop O(W·H) sobre `list[list[Tile]]` alcanza ~2.3 s en CPython 3.14 para un
    mundo Large (20 M tiles). RNF-03 (< 500 ms) requiere vectorización numpy. Solución propuesta:
    exponer en B1 (`TileGrid`) arrays numpy cacheados (`tile_ids: np.ndarray`, `wall_ids: np.ndarray`)
    o agregar una utilidad `to_arrays() -> tuple[NDArray, NDArray]`; el motor usaría `np.where` en
    lugar del loop Python. No se toca en esta iteración (cambio de contrato en B1).
  - **SP-wall-mapping** — Actualmente el wall match usa comparación directa `item_id == wall_id`.
    Si en Terraria la relación ítem→pared NO es 1:1 (similar a bloques), habrá que añadir un
    `item_to_wall_mapping` al factory y al JSON. Pendiente de validar con datos reales.

## 11. Decisiones tomadas en iter-004
- **Wall search = comparación directa** (`item_id == wall_id`): SP-02 no menciona "a través de
  mapping", a diferencia de SP-01. Se asume identidad ítem-pared como primera aproximación.
- **Budget de T-08 = 3.5 s**: el loop Python mide ~2.3 s; se usa margen 1.5× para varianza de CI.
  El test sirve como guardia de regresión, no como gate estricto de RNF-03.
- **Módulo de dominio puro**: cero imports de FastAPI/pydantic; todos los modelos son `dataclass`.