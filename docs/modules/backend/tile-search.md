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

Version actual documentada: `3.0.0` (iter-13). Formato legible inspirado en el catalogo de items: `items` es una lista de entradas, cada una con `item_id`, `item_name` y `matchers`. Cada matcher usa `world_id` (tile o wall segun categoria) y admite campos opcionales de legibilidad (`world_name`, `world_internal_name`, `source_url`, `sub_id`, `safe`).

```json
{
  "schema_version": "3.0.0",
  "items": [
    {
      "item_id": 48,
      "item_name": "Chest",
      "matchers": [
        {
          "category": "object",
          "world_id": 21,
          "world_name": "Containers",
          "frame_xy": [0, 0],
          "source_url": "https://terraria.wiki.gg/wiki/Tile_IDs/Part1"
        }
      ]
    },
    {
      "item_id": 30,
      "item_name": "Dirt Wall",
      "matchers": [
        {
          "category": "wall",
          "world_id": 2,
          "world_name": "Dirt Wall",
          "world_internal_name": "DirtWall",
          "safe": true
        }
      ]
    }
  ]
}
```

Reglas:

- La raiz solo admite `items` y `schema_version`.
- `schema_version` debe coincidir exactamente con `SCHEMA_VERSION` (`"3.0.0"`); cualquier otra cosa lanza `MappingStaleError`. **No hay compatibilidad con `2.0.0`**: el campo `items` ahora es una lista, los matchers usan `world_id`/`world_ids` y se rechaza la forma legacy dict-of-string-id.
- Cada entrada de `items` admite solo `item_id`, `item_name`, `matchers`.
- `item_id`: entero positivo unico en la lista.
- `item_name`: string no vacio.
- `matchers`: lista no vacia. Alias soportado: un mismo `item_id` puede declarar varios matchers.
- Cada matcher admite solo: `category`, `world_id`, `world_ids`, `world_name`, `world_internal_name`, `item_id` (debe coincidir con el padre si esta presente), `item_name` (idem), `frame_xy`, `frame_xys`, `sub_id`, `safe`, `source`, `source_url`.
  - `category="block"` requiere `world_id`. Prohibe `world_ids`/`frame_xy`/`frame_xys`/`safe`.
  - `category="wall"` requiere exactamente uno de `world_id` (single) o `world_ids` (lista no vacia, multi-wall). Prohibe `frame_xy`/`frame_xys`. Admite `safe: bool` opcional.
  - `category="object"` requiere `world_id` y admite a lo sumo uno de `frame_xy` o `frame_xys`. Sin frame, el motor deduce la esquina superior izquierda por continuidad de frames.
- Los campos `world_name`, `world_internal_name`, `source`, `source_url` deben ser strings no vacios cuando estan presentes; `sub_id` debe ser int. Estos campos no afectan la busqueda; solo aportan trazabilidad.
- Colisiones detectadas al cargar: dos items distintos compartiendo el mismo `block world_id`, el mismo `wall_id` o el mismo `object world_id` sin `frame_*`.
- `MappingStaleError` extiende `ValueError`.
- El motor sigue construyendo internamente `ItemMatcher(category, tile_id, wall_ids, frame_xys)`; el contrato publico no cambia.

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
- `Mana Crystal` no tiene tile placeable directo; se cubre como tile `ManaCrystal`/`Repaired Mana Crystal` (`world_id=639`) porque ese objeto colocado suelta Mana Crystal. Queda marcado como alias pragmatico.
- Paredes con variantes safe/unsafe quedan representadas por un solo `world_id` primario en esta version del formato. El campo `safe: bool` opcional documenta la variante cuando aplica.
- Criterio de inclusion: solo se mapean tiles/walls cuyo item placeable correspondiente exista en el catalogo B3 y este verificado en terraria.wiki.gg/wiki/Tile_IDs o /wiki/Wall_IDs. Tiles puramente naturales, decorativos o internos sin item asociado quedan fuera.
- `backend/src/twi/tile_search/data/item_tile_map.json` es legacy y no se utiliza: el motor por defecto carga `item_world_map.json`. Su ausencia/borrado no afecta a la busqueda.

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
- `_mapping.py` separa parseo/validacion del JSON v3 del matcher interno (`ItemMatcher` no cambia su forma: `category`, `tile_id`, `wall_ids`, `frame_xys`).
- Los campos legibles del JSON (`world_name`, `world_internal_name`, `item_name`, `source*`, `sub_id`, `safe`) se validan pero NO afectan la busqueda: el motor solo construye `ItemMatcher` a partir de `world_id`/`world_ids` y `frame_xy`/`frame_xys`.
- La carga por defecto usa `data/item_world_map.json`; el fichero legacy `item_tile_map.json` queda sin uso y puede borrarse.
- `backend/scripts/_gen_world_map.py` es un generador one-shot del JSON v3 a partir del catalogo de items. Solo se ejecuta manualmente para regenerar el fichero.
- La iteracion del grid branch-ea por categoria antes de recorrer el mundo para no pagar checks de `object` en busquedas de bloque/pared.
- Los matches se devuelven ordenados por `(y, x)` para orden consistente en el frontend.

## 9. Performance

- Target historico: world large (8400x2400 aprox. 20M tiles) + 1000 chests < 500 ms.
- Estado actual (deuda-2026-05-31): B1 `TileGrid` construye indices compactos `tile_id -> posiciones` y `wall_id -> posiciones`; B4 consulta esos indices, por lo que cada busqueda queda acotada por candidatos del item en lugar de `width * height`.
  - 1000x1000 (1M tiles), Dirt: < 500 ms (`test_search_one_million_tiles_under_500_ms`).
  - 8400x2400 (20.16M tiles), tile sintetico: < 500 ms (`test_search_large_world_completes_within_budget`).
- RNF-03 (< 500 ms para Large) queda cubierto por test de regresion: cierra PERF-01.

## 10. Errores

- Item inexistente o no mapeado no es error: resultado vacio.
- `item_world_map.json` invalido si es error de arranque del motor: se lanza `ValueError`.

## 11. Estado

- **Version del contrato**: v4 (sin cambio de contrato publico)
- **Ultimo cierre**: 2026-06-02
- **Iteracion actual**: cerrada (iter-13 schema v3 legibility).
- **Version JSON**: `3.0.0` (root key `schema_version`, items es ahora una lista de entradas `{item_id, item_name, matchers[]}` con campos legibles `world_id`/`world_name`/`world_internal_name`/`safe`/`source_url`). Sin compatibilidad con `2.0.0`.
- **Conteo cubierto**: 340 entradas totales; 160 `block`, 33 `wall`, 151 `object` (344 matchers). Incluye chest variants por frame, statues, altares, forges, muebles, estaciones de crafteo y decoraciones placeables. Item `109` (Mana Crystal) sigue con alias multi-matcher (`world_id=29` + `world_id=639`).
- **Verificacion** (2026-06-02):
  - `python -m pytest tests/unit/tile_search/test_tile_search.py -q`: 43 passed.
  - `python -m mypy src/twi/tile_search src/twi/wld_parser --strict`: sin errores.
  - `python -m ruff check src/twi/tile_search tests/unit/tile_search`: All checks passed.
  - `python -m ruff format src/twi/tile_search tests/unit/tile_search --check`: 6 files already formatted.
  - Perf real cubierta por tests: 1M tiles < 500 ms y 20M tiles < 500 ms.
- **Deuda / follow-ups**:
  - **VERIFY-EXT-01 (cerrada 2026-05-31)**: suite backend completa verde con `python -m pytest -q` (227 passed), sin `--ignore` ni workarounds. Caches locales `.pytest_cache`/`.ruff_cache` normalizadas en Windows.
  - **DATA-EXPAND-01 (cerrada 2026-05-31)**: `item_world_map.json` ampliado de 59 a 109 items con desert/ocean/glowing moss, paredes asociadas y objetos adicionales.
  - **API-DOCS-OBJECT**: cerrado documentalmente 2026-05-19. En v0.2 `source="object"` sigue siendo el contrato público para objetos/tile frames; `tile_entity` no se introduce como source público hasta una futura versión de contrato.
  - **PERF-01 (cerrada 2026-05-31)**: `TileGrid` expone indices compactos por `tile_id`/`wall_id`; B4 los usa para busquedas block/wall/object. `test_search_large_world_completes_within_budget` exige RNF-03 < 500 ms para 20.16M tiles.
  - **SOURCE-TILE_ENTITY**: decisión 2026-05-19: mantener `source ∈ {block, wall, chest, object}` en v0.2. `tile_entity` queda reservado para v0.3 si se amplía contrato API + engine.
