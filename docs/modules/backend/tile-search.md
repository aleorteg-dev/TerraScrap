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
- [ ] `T-01 test_search_finds_block_matches`
- [ ] `T-02 test_search_finds_wall_matches`
- [ ] `T-03 test_search_finds_chest_items`
- [ ] `T-04 test_search_without_containers_excludes_chest_matches`
- [ ] `T-05 test_search_returns_empty_when_no_matches`
- [ ] `T-06 test_search_total_matches_len_matches`
- [ ] `T-07 test_search_is_pure_and_deterministic`
- [ ] `T-08 test_search_large_world_completes_within_budget` (marca `@pytest.mark.perf`)

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
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —