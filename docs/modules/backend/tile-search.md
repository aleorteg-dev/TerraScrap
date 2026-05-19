# Modulo `B4 - tile-search`

## 1. Proposito
Motor de busqueda sobre un `World` ya parseado. Dado un `item_id`, devuelve todas las coordenadas donde aparece como bloque, pared, objeto colocado o dentro de cofres.

## 2. Contrato publico

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
    item_to_object_mapping: Mapping[int, int] | None = None,
    item_to_object_frame_mapping: Mapping[int, tuple[int, int]] | None = None,
) -> TileSearchEngine: ...
```

## 3. Categorias de match

- `block`: compara `Tile.tile_id` contra el `tile_id` documentado para un item de terreno solido o bloque de construccion. Emite un match por cada celda ocupada por ese bloque.
- `wall`: compara `Tile.wall_id` contra el `wall_id` documentado para un item de pared. Emite un match por cada celda de pared.
- `object`: compara `Tile.tile_id` contra un tile placeable multi-celda o frame-important: estatuas, antorchas, puertas, muebles, cristales y estaciones. Si el mapping tiene `frame_xy`, solo matchea la celda cuya pareja `(frame_x, frame_y)` coincide. Si no lo tiene, el motor deduce la esquina superior izquierda por continuidad de frames. En ambos casos emite una sola vez por instancia, en la esquina superior izquierda del frame.
- `chest`: no usa `item_world_map.json`; recorre los `Chest.items` parseados por B1 y emite un match por slot coincidente en `(chest.x, chest.y)`.

`block` y `object` comparten el campo `tile_id`, pero no significan lo mismo. `block` es terreno o bloque solido 1x1 que debe reportarse por celda. `object` es un tile colocado con entidad visual propia o varias celdas; debe reportarse por instancia, no por cada celda ocupada.

`include_containers=False` omite `source="chest"`. Los objetos colocados siguen apareciendo porque no son contenedores semanticos en este contrato.

## 4. Formato de `item_world_map.json`

Version actual documentada: `2.0.0` (iter-12).

```json
{
  "schema_version": "2.0.0",
  "items": {
    "<item_id>": [
      { "category": "block", "tile_id": 0 },
      { "category": "wall", "wall_id": 1 },
      { "category": "wall", "wall_ids": [10, 20, 30] },
      { "category": "object", "tile_id": 105, "frame_xy": [72, 0] },
      { "category": "object", "tile_id": 250, "frame_xys": [[0, 0], [18, 0]] }
    ]
  }
}
```

Reglas:

- La raiz solo admite `items` y `schema_version`.
- `schema_version` debe coincidir exactamente con la constante `SCHEMA_VERSION` (`"2.0.0"`); cualquier otra cosa lanza `MappingStaleError` al cargar.
- Las claves de `items` son `item_id` numericos como string.
- Cada `item_id` mapea a una lista NO vacia de matchers (alias: un mismo item puede mapear a varios `(tile_id, frame)` distintos, p.ej. Mana Crystal -> tile 29 y tile 639).
- Cada matcher define una `category` y los campos pertinentes:
  - `category="block"` requiere `tile_id`. Prohibe `wall_id`/`wall_ids`/`frame_xy`/`frame_xys`.
  - `category="wall"` requiere exactamente uno de `wall_id` (single) o `wall_ids` (lista no vacia, multi-wall). Prohibe `tile_id`/`frame_xy`/`frame_xys`.
  - `category="object"` requiere `tile_id` y admite a lo sumo uno de `frame_xy` (single) o `frame_xys` (lista no vacia, multi-frame). Si no se da ninguno, el motor deduce la esquina superior izquierda por continuidad de frames.
- No se permiten claves desconocidas en root ni en matcher.
- Colisiones detectadas al cargar: dos items distintos compartiendo el mismo `block tile_id`, el mismo `wall_id`, o el mismo `object tile_id` sin `frame_*`.
- `MappingStaleError` extiende `ValueError`; se importa desde `twi.tile_search._mapping` y permite a callers diferenciar JSON desactualizado de errores semanticos.

## 5. Alcance de datos de esta iteracion

Fuente de `item_id`: catalogo B3 local `backend/src/twi/item_catalog/data/items.seed.json`.

Fuentes de `tile_id`, `wall_id` y `frame_xy`:

- Terraria wiki.gg: `https://terraria.wiki.gg/wiki/Item_IDs`, `https://terraria.wiki.gg/wiki/Tile_IDs/Part1`, `https://terraria.wiki.gg/wiki/Tile_IDs/Part2`, `https://terraria.wiki.gg/wiki/Tile_IDs/Part3`, `https://terraria.wiki.gg/wiki/Tile_IDs/Part4`, `https://terraria.wiki.gg/wiki/Tile_IDs/Part5`, `https://terraria.wiki.gg/wiki/Tile_IDs/Part6`, `https://terraria.wiki.gg/wiki/Tile_IDs/Part7`, `https://terraria.wiki.gg/wiki/Tile_IDs/Part8`, `https://terraria.wiki.gg/wiki/Tile_IDs/Part9`, `https://terraria.wiki.gg/wiki/Wall_IDs`.
- Terraria wiki.gg paginas concretas: `https://terraria.wiki.gg/wiki/Altars`, `https://terraria.wiki.gg/wiki/Statues`, `https://terraria.wiki.gg/wiki/Hardmode_Forges`, `https://terraria.wiki.gg/wiki/Life_Crystal`, `https://terraria.wiki.gg/wiki/Repaired_Mana_Crystal`, `https://terraria.wiki.gg/wiki/Dungeon_Brick_Walls`, `https://terraria.wiki.gg/wiki/Hallowed_Walls`.
- TerraMap local como referencia de `U/V`: `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io\resources\js\settings.js`, entradas `Tiles` para ids `12`, `26`, `77`, `105`, `133`, `639`.

Cobertura minima congelada:

- Bloques: Dirt Block, Stone Block, Wood, Ebonstone Block, Crimstone Block, Pearlstone Block, Hellstone, Obsidian, Snow Block, Sand Block, Mud Block, Ash Block, Granite Block, Marble Block, Meteorite, Lihzahrd Brick, Copper Ore, Tin Ore, Iron Ore, Lead Ore, Silver Ore, Tungsten Ore, Gold Ore, Platinum Ore, Demonite Ore, Crimtane Ore, Cobalt Ore, Palladium Ore, Mythril Ore, Orichalcum Ore, Adamantite Ore, Titanium Ore, Chlorophyte Ore.
- Walls: Dirt Wall, Stone Wall, Wood Wall, Blue Brick Wall, Green Brick Wall, Pink Brick Wall, Blue Slab Wall, Blue Tiled Wall, Green Slab Wall, Green Tiled Wall, Pink Slab Wall, Pink Tiled Wall, Hallowed Prism Wall, Hallowed Cavern Wall, Hallowed Shard Wall, Hallowed Crystalline Wall.
- Objects: Torch, Heart Statue, Star Statue, Life Crystal, Mana Crystal, Demon Altar, Crimson Altar, Hellforge, Adamantite Forge, Titanium Forge.

Notas de datos:

- Para `Demon Altar` y `Crimson Altar`, B3 contiene tambien items icon-only `6135/6136`. Esta iteracion usa `5532/5533`, que son los item IDs placeables indicados por wiki.gg para Terraria 1.4.5.
- `Mana Crystal` no tiene tile placeable directo; se cubre como tile `ManaCrystal`/`Repaired Mana Crystal` (`tile_id=639`) porque ese objeto colocado suelta Mana Crystal. Queda marcado como alias pragmatico.
- Paredes con variantes safe/unsafe quedan representadas por un solo `wall_id` primario en esta version del formato.

## 6. Especificacion (SDD)

- **SP-01** Item con categoria `block`: todas las celdas cuyo `tile_id` coincida aparecen como `source="block"`.
- **SP-02** Item con categoria `wall`: todas las celdas cuyo `wall_id` coincida aparecen como `source="wall"`.
- **SP-03** Item con categoria `object`: todas las instancias cuyo `tile_id` y, si aplica, `frame_xy` coincidan aparecen como `source="object"` una sola vez por instancia en la esquina superior izquierda.
- **SP-04** Cada slot de cada `Chest` con `item_id` coincidente produce un `SearchMatch` con `source="chest"`, `chest_id` y `stack`.
- **SP-05** Con `include_containers=False`, se omiten los matches de cofres.
- **SP-06** `total == len(matches)`.
- **SP-07** Si no hay matches o el item no esta mapeado, devuelve `SearchResult(item_id, 0, ())`.
- **SP-08** El motor es puro: no muta `world` ni caches compartidas.
- **SP-09** Dos chests apilados en la misma coordenada con el mismo item generan dos matches distintos.
- **SP-10** La carga de `item_world_map.json` valida formato y colisiones al construir el motor; un archivo invalido falla pronto.

## 7. Plan de tests (TDD)

- [x] `test_engine_finds_block_match`
- [x] `test_engine_finds_wall_match`
- [x] `test_engine_finds_object_match_once_per_instance`
- [x] `test_engine_unknown_item_returns_empty`
- [x] `test_engine_chest_match_still_works`
- [x] `test_data_file_has_minimum_coverage`
- [x] `test_data_file_schema_valid`
- [x] `test_object_with_multiple_frames_uses_frame_xy`
- [x] `test_engine_multi_wall_match` (iter-12: cierra MULTI-WALL-ID).
- [x] `test_engine_multi_frame_match` (iter-12: cierra MULTI-FRAME-ITEM).
- [x] `test_engine_alias_multi_matchers` (iter-12: cierra OBJECT-ALIAS-01).
- [x] `test_match_source_field_per_kind` (iter-12: source per kind).
- [x] `test_load_stale_schema_version_raises`, `test_load_missing_schema_version_raises`, `test_load_wrong_schema_version_raises` (iter-12: cierra STALE-JSON, JSON v2.0.0 con `MappingStaleError`).
- [x] `test_default_world_map_uses_current_schema_version` (iter-12).
- [x] `test_search_one_million_tiles_under_500_ms` (iter-12: budget 500 ms a 1M tiles, medido ~70 ms).
- [x] Regresiones existentes de pureza, orden, chests apilados, no contaminacion block/wall y performance.

## 8. Notas de implementacion

- El motor mantiene compatibilidad con `item_to_tile_mapping` y `item_to_wall_mapping` inyectados para tests existentes, y agrega `item_to_object_mapping` + `item_to_object_frame_mapping`.
- `_mapping.py` separa parseo/validacion del JSON del matcher del mundo.
- La carga por defecto usa `data/item_world_map.json`; el fichero legado `item_tile_map.json` queda sin uso.
- La iteracion del grid branch-ea por categoria antes de recorrer el mundo para no pagar checks de `object` en busquedas de bloque/pared.
- Los matches se devuelven ordenados por `(y, x)` para orden consistente en el frontend.

## 9. Performance

- Target historico: world large (8400x2400 aprox. 20M tiles) + 1000 chests < 500 ms.
- Estado actual (iter-12): single-pass combinado para block+wall, set-lookup O(1) por target. Mediciones locales:
  - 1000x1000 (1M tiles), Dirt: ~70 ms (budget 500 ms). 5 corridas: 69.7, 65.4, 65.7, 77.9, 69.9 ms.
  - 8400x2400 (20.16M tiles), tile sintetico: ~1.4 s (budget 3.5 s).
- RNF-03 (< 500 ms para Large) sigue requiriendo vectorizacion o arrays auxiliares en B1: deuda PERF-01.

## 10. Errores

- Item inexistente o no mapeado no es error: resultado vacio.
- `item_world_map.json` invalido si es error de arranque del motor: se lanza `ValueError`.

## 11. Estado

- **Version del contrato**: v4 (iter-12)
- **Ultimo cierre**: 2026-05-10
- **Iteracion actual**: cerrada (iter-12)
- **Version JSON**: `2.0.0` (root key `schema_version`, items mapean a lista de matchers).
- **Conteo cubierto**: 59 items totales; 33 `block`, 16 `wall`, 10 `object`. Item `109` (Mana Crystal) lleva 2 matchers (alias `tile_id=29` + `tile_id=639`).
- **Verificacion** (2026-05-10):
  - `python -m pytest tests/unit/tile_search/test_tile_search.py -q`: 33 passed.
  - `python -m pytest tests/unit/api_rest -q`: 58 passed (sin regresiones).
  - `python -m coverage run --source=src/twi/tile_search -m pytest tests/unit/tile_search/test_tile_search.py -q` + `python -m coverage report --fail-under=80`: 89%.
  - `python -m mypy src/twi/tile_search --strict`: sin errores.
  - `python -m ruff check src/twi/tile_search tests/unit/tile_search`: All checks passed.
  - `python -m ruff format src/twi/tile_search tests/unit/tile_search --check`: 6 files already formatted.
  - Perf real: 1M tiles 65-78 ms (budget 500 ms); 20M tiles 1.4 s (budget 3.5 s).
- **Deuda / follow-ups**:
  - **VERIFY-EXT-01**: resolver permisos de pytest tmp/cache en el entorno Windows para poder cerrar la suite completa sin `--ignore` ni workarounds. Iter-12 evita `os.chmod` en tests; sigue abierto a nivel de suite global.
  - **DATA-EXPAND-01**: ampliar muebles, decoracion, objetos de eventos, NPC-related tiles, bioma desert/ocean/glowing moss y variantes modernas fuera de la lista minima de 50+ items. Iter-12 no introduce items nuevos: el set base ya contiene 59 items por encima del minimo.
  - **API-DOCS-OBJECT**: cerrado documentalmente 2026-05-19. En v0.2 `source="object"` sigue siendo el contrato público para objetos/tile frames; `tile_entity` no se introduce como source público hasta una futura versión de contrato.
  - **PERF-01**: RNF-03 (< 500 ms) en world Large requiere arrays vectorizables desde B1; iter-12 mejora el caso 1M tiles (65-78 ms) pero el caso 20M sigue alrededor de 1.4 s.
  - **SOURCE-TILE_ENTITY**: decisión 2026-05-19: mantener `source ∈ {block, wall, chest, object}` en v0.2. `tile_entity` queda reservado para v0.3 si se amplía contrato API + engine.
