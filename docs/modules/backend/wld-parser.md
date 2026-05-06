# Módulo `B1 – wld-parser`

## 1. Propósito
Leer un fichero `.wld` de Terraria y producir un **modelo de dominio en memoria** tipado e inmutable (tiles, chests, signs, metadatos). No conoce HTTP ni caché; es puro.

## 2. Contrato público

### 2.1. Tipos
```python
@dataclass(frozen=True)
class WorldMetadata:
    name: str
    width: int
    height: int
    version: int
    seed: str
    size: Literal["small", "medium", "large"]
    hardmode: bool
    # Added in iter-02 (v0.2 contract). Defaults allow backward-compat fixtures.
    spawn_x: int = 0
    spawn_y: int = 0
    world_surface_y: float = 0.0   # float64 from .wld binary
    rock_layer_y: float = 0.0      # float64 from .wld binary
    hell_layer_y: float = 0.0      # computed: TerraMap formula (height - 235)

@dataclass(frozen=True)
class Tile:
    tile_id: int | None        # bloque colocado (None = aire)
    wall_id: int | None
    liquid_type: Literal["none", "water", "lava", "honey", "shimmer"]  # tipo de líquido
    liquid_amount: int          # 0..255; 0 cuando liquid_type == "none"
    flags: int                  # bits de flags2 | (flags3 << 8) | (flags4 << 16)
    frame_x: int | None = None  # U: solo presente si tfi[tile_id] == True; None en tiles unframed/aire
    frame_y: int | None = None  # V: idem; forzado a 0 cuando tile_id == 144 (Timers)

@dataclass(frozen=True)
class ChestItem:
    item_id: int
    stack: int
    prefix: int

@dataclass(frozen=True)
class Chest:
    chest_id: int
    x: int
    y: int
    name: str
    items: tuple[ChestItem, ...]    # tamaño fijo 40, slots vacíos = ChestItem(0,0,0)

@dataclass(frozen=True)
class Sign:
    x: int
    y: int
    text: str

@dataclass(frozen=True)
class Npc:
    id: int
    name: str
    position_x: float
    position_y: float
    is_homeless: bool
    home_x: int
    home_y: int
    is_town_npc: bool

class TileGrid:                     # read-only, indexable grid[x][y] -> Tile
    width: int
    height: int
    def __getitem__(self, x: int) -> Sequence[Tile]: ...

@dataclass(frozen=True)
class World:
    metadata: WorldMetadata
    tiles: TileGrid
    chests: tuple[Chest, ...]
    signs: tuple[Sign, ...]
    npcs: list[Npc]
```

### 2.2. Funciones
```python
def parse_wld(stream: BinaryIO) -> World: ...
def parse_wld_bytes(data: bytes) -> World: ...

class WldParseError(Exception):
    code: str | None  # "invalid_header" | "truncated" | "corrupt" | "unsupported_version"
    details: dict[str, object]

class UnsupportedWorldVersionError(WldParseError):
    version: int
    detected_version: int
    supported_range: tuple[int, int]
```

Rango de versiones soportado: **>= 230 y <= 319**. Fuera de rango -> `UnsupportedWorldVersionError` con `code="unsupported_version"` y `details={"detected_version": version, "supported_range": (230, 319)}`.

### 2.3. Versiones soportadas

Referencia normativa local revisada completa: `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io\resources\js\WorldLoader.js`.

Tramos aceptados:
- `v230-v279`: tramo historico ya soportado, con gates corregidos segun `WorldLoader.js` para special world flags (`>=222`, `>=227`, `>=238`, `>=239`, `>=241`, `>=249`, `>=266`, `>=267`).
- `v280-v286`: sin campos nuevos de header documentados en `WorldLoader.js`; section 2 usa layout moderno de chests (`itemCount:int32` por chest). Esta frontera `>279` es inferida del corpus: v279 conserva `chestSize:int16` global y v319 sigue `readChests` de `WorldLoader.js`.
- `v287-v288`: section 0 anade `forceHalloweenForever`, `forceXMasForever` (`>=287`) y `vampireSeed` (`>=288`) en la cola de header.
- `v291-v295`: section 0 anade `_tempMeteorShowerCount:int32` y `_tempCoinRain:int32` (`>=291`).
- `v296-v298`: section 0 anade `infectedSeed:uint8` (`>=296`) y `teamBasedSpawnsSeed:uint8` + lista variable de pares `int16,int16` (`>=297`).
- `v299-v301`: section 0 anade `manifest:string` (`>=299`) y un `uint32` heredado para `>=299 && <313`.
- `v302-v303`: section 0 anade `skyblockWorld:uint8` antes de los timestamps (`>=302`).
- `v304-v312`: section 0 anade `dualDungeonsSeed:uint8` (`>=304`) y conserva el `uint32` heredado hasta `<313`.
- `v313-v319`: conserva `manifest:string` y deja de leer el `uint32` heredado.

Campos nuevos relevantes para el parser:
- Header section 0: `skyblockWorld:uint8` se lee condicionalmente para alinear correctamente los campos posteriores usados por `WorldMetadata`.
- Header section 0 tail: los campos de `v287+`, `v288+`, `v291+`, `v296+`, `v297+`, `v299+`, `v304+` no forman parte del contrato publico actual; se saltan mediante offsets de seccion del formato `.wld` tras leer la metadata contratada.
- Tiles section 1: se consume el cuarto byte de flags cuando `flags3 & 0x01`; se corrige el byte alto de `wall_id` a `flags3 & 0x40`, en el orden de lectura de `WorldLoader.js`; `flags3 & 0x80` sigue representando `shimmer`.
- Chests section 2: para `v280+` se usa layout moderno sin `chestSize:int16` global; cada chest lee `itemCount:int32` tras `name`. Para `v230-v279` se conserva `chestSize:int16` global por compatibilidad con corpus v279.

## 3. Dependencias
- Ninguna interna.
- Stdlib: `struct`, `io`, `typing`, `dataclasses`.
- Opcional: `numpy` para el grid (`TileGrid` puede envolver un `ndarray` empaquetado).

## 4. No objetivos
- No persiste.
- No sirve HTTP.
- No decodifica sprites.
- No valida integridad semántica más allá de la estructura binaria.

## 5. Especificación (SDD)
- **SP-01** Dado un `.wld` válido de tamaño *small*, el parser devuelve un `World` con `metadata.width` y `metadata.height` coherentes con el tamaño declarado.
- **SP-02** Un tile vacío (aire) se representa con `tile_id=None`.
- **SP-03** Los chests se devuelven con su posición *(x, y)* y un array de 40 slots; los slots vacíos tienen `item_id=0`.
- **SP-04** Un fichero con cabecera distinta a la firma Terraria lanza `WldParseError`.
- **SP-05** Un fichero con versión fuera de rango lanza `UnsupportedWorldVersionError(version=...)`.
- **SP-05b** Un fichero v320 o superior lanza `UnsupportedWorldVersionError` con `detected_version=<version>`, `supported_range=(230, 319)` y detalles legibles para la API/UX.
- **SP-05c** Un fichero v319 valido se parsea y devuelve `World` con metadata y dimensiones de tiles coherentes.
- **SP-06** El parser es **determinista**: el mismo input produce el mismo `World` (igualdad estructural).

## 6. Plan de tests (TDD)
Fixtures sintéticas bajo `backend/tests/fixtures/wld_builder.py` generadas por helpers (no usar mundos reales).

- [x] `T-01 test_parse_empty_minimal_world_returns_expected_metadata`
- [x] `T-02 test_parse_reads_tiles_as_grid_with_expected_dimensions`
- [x] `T-03 test_parse_air_tile_has_none_tile_id`
- [x] `T-04 test_parse_chest_items_returns_40_slots_with_empty_slots_zeroed`
- [x] `T-05 test_parse_rejects_invalid_header_with_wld_parse_error` (+ truncated variant)
- [x] `T-06 test_parse_rejects_unsupported_version_{below,above}_range`
- [x] `T-07 test_parse_is_deterministic_same_bytes_equal_world`
- [x] `T-08 test_parse_large_synthetic_world_completes_within_budget` (`@pytest.mark.perf`)
- [x] `T-09 test_parse_framed_tile_reads_frame_x_y` (iter-019)
- [x] `T-10 test_parse_unframed_tile_has_none_frames` (iter-019)
- [x] `T-11 test_parse_tile_id_144_forces_frame_y_zero` (iter-019)
- [x] `T-12 test_round_trip_builder_parser_preserves_frames` (iter-019)
- [x] `T-13 test_parse_water_tile_amount_and_type` (iter-020)
- [x] `T-14 test_parse_lava_tile` (iter-020)
- [x] `T-15 test_parse_honey_tile` (iter-020)
- [x] `T-16 test_parse_shimmer_tile` (iter-020)
- [x] `T-17 test_parse_dry_tile` (iter-020)
- [x] `T-18 test_parse_rejects_version_319_with_user_facing_details` (iter-021, reemplazado en iter-026)
- [x] `T-19 test_parse_v319_real_world_ok` (iter-026)
- [x] `T-20 test_parse_above_ceiling_raises_unsupported_version` (iter-026)
- [x] `T-21 test_parse_v230_still_ok` (iter-026)
- [x] `T-22 test_parse_v279_still_ok` (iter-026)
- [x] `T-23 test_parse_v302_skyblock_world_flag_alignment_ok` (iter-026)
- [x] `T-24 test_parse_v304_dual_dungeons_tramo_ok` (iter-026)
- [x] `T-25 test_parse_documented_intermediate_version_tramos_ok` (iter-026)
- [x] `T-26 test_parse_metadata_exposes_spawn_x_y` (iter-02)
- [x] `T-27 test_parse_metadata_exposes_world_surface_y` (iter-02)
- [x] `T-28 test_parse_metadata_exposes_rock_layer_y` (iter-02)
- [x] `T-29 test_parse_metadata_hell_layer_y_derived_from_terramap_formula` (iter-02)
- [x] `T-30 test_parse_metadata_new_field_types_are_correct` (iter-02)
- [x] `T-31 test_parse_world_info_truncated_before_spawn_raises_invalid_world_info` (iter-02)
- [x] `T-32 test_parse_npcs_returns_same_size_and_fields` (iter-03)
- [x] `T-33 test_parse_zero_npcs_returns_empty_list` (iter-03)
- [x] `T-34 test_parse_npc_with_position_outside_world_raises_invalid_npc` (iter-03)

## 7. Notas de implementación
- El `.wld` es binario little-endian. Secciones principales (en orden aproximado): Header, Tiles, Chests, Signs, NPCs, Tile Entities, Footer.
- Para tiles, Terraria usa un esquema RLE por columnas con un byte de flags que indica presencia de bloque, pared, líquido, cables, etc. Implementar **solo** lo necesario para reconstruir `Tile`.
- Implementar primero un generador de `.wld` sintético minimal bajo `tests/fixtures/wld_builder.py` que escriba cabecera y un grid pequeño; los tests del parser trabajan contra ese builder. Eso evita depender de ficheros reales enormes.
- Referencia viva: implementaciones open-source (TEdit, Terramap) para corroborar el layout binario. **No copiar código**; usar solo como referencia de formato.

## 8. Performance
- Target: mundo *large* (8400×2400) < 10 s; memoria pico < 1 GB.
- Evitar listas de dicts; usar arrays homogéneos / `numpy` si se necesita.

## 9. Errores
- `WldParseError`: cabecera inválida, EOF inesperado, sección corrupta. Expone `code` y `details`.
- `WldParseError(code="invalid_npc")`: NPC con posición fuera de `[0, width)` / `[0, height)` o hogar inválido cuando no es homeless.
- `UnsupportedWorldVersionError`: fuera de rango soportado. Expone `version`, `detected_version`, `supported_range` y `details`.

## 10. Estado
- **Versión del contrato**: v2.4
- **Último cierre**: 2026-05-06
- **Iteración actual**: iter-03
- **Tests**: `python -m pytest tests/unit/wld_parser -q` verde (42/42). `mypy src/twi/wld_parser --strict` sin errores. `ruff check` y `ruff format --check` sin warnings. Cobertura B1: 90%.

### Decisiones tomadas (iter-03 / 2026-05-06)
- `Npc` añadido al contrato de dominio con `id`, `name`, `position_x`, `position_y`, `is_homeless`, `home_x`, `home_y`, `is_town_npc`.
- `World.npcs: list[Npc]` se puebla desde la sección NPCs tras `_read_signs`.
- Para `v230-v279` se respeta el layout de `readNpcs`: tabla de kill-counts en `v>=268`, lista de NPCs con nombre/hogar terminada por bool, y lista secundaria terminada por bool.
- `position_x` y `position_y` se exponen en coordenadas de tile (`float`), dividiendo las posiciones binarias en píxeles por 16.
- Coordenadas de posición fuera del mundo y hogares inválidos en NPCs no homeless lanzan `WldParseError(code="invalid_npc")`.
- `wld_builder.py` emite la sección 4 con `NpcSpec`, parámetro `npcs=` en `build_world` y helper `WldBuilder.add_npc(...)`.
- Tests T-32..T-34 cubren round-trip de N NPCs, lista vacía y error `invalid_npc`.

### Decisiones tomadas (iter-026)
- Techo actualizado a `_MAX_VERSION = 319`; `v320+` conserva `UnsupportedWorldVersionError(code="unsupported_version")` con `supported_range=(230, 319)`.
- `WorldLoader.js` se uso como referencia para gates de special world flags y deltas `v287+`, `v288+`, `v291+`, `v296+`, `v297+`, `v299+`, `v302+`, `v304+`.
- El contrato publico no anade campos nuevos: `WorldMetadata`, `Tile`, `Chest`, `Sign` y `World` se mantienen compatibles.
- Se lee `skyblockWorld` (`v302+`) porque esta antes de campos usados por `WorldMetadata`.
- La cola de header con campos no expuestos se salta mediante offsets de seccion, como permite el formato.
- Tiles: se consume `flags4` cuando `flags3 & 0x01`; el byte alto de `wall_id` se lee con `flags3 & 0x40` y queda cubierto por fixture sintetica v319.
- Chests: `v230-v279` mantiene `chestSize:int16` global; `v280-v319` usa `itemCount:int32` por chest, validado contra el corpus real v319.
- Corpus real validado: `Gotear_Tierras_llanas.wld` (`v279`) y `El_Ínsula_Ultranervioso.wld` (`v319`) parsean con metadata y dimensiones coherentes.

### Decisiones tomadas (iter-02 / 2026-05-06)
- `WorldMetadata` extendida con `spawn_x: int`, `spawn_y: int`, `world_surface_y: float`, `rock_layer_y: float`, `hell_layer_y: float`. Todos con defaults `0`/`0.0` para compatibilidad con fixtures de B2/B4/B5 que no los proveen.
- `_read_world_info` corregido para seguir el orden binario real de WorldLoader.js: tras `moonType` se leen los 17 int32 de estilos de fondo, luego `spawnX`, `spawnY`, `worldSurfaceY` y `rockLayerY` (float64), luego los campos hasta `hardMode`.
- La función saltaba antes de los campos de árbol/cueva/fondo directamente a los booleans de jefes, lo que producía `hardmode` correcto solo por coincidencia al usar el builder sintético. El nuevo parseo es fiel al formato real.
- `hell_layer_y` se calcula (no lee): fórmula TerraMap `((h-230)-surf)/6 * 6 + surf - 5`, que simplifica a `h - 235.0`.
- `_build_section0` en `wld_builder.py` actualizado para emitir el formato real completo. Nuevos parámetros en `build_world`: `spawn_x=100`, `spawn_y=50`, `world_surface_y=200.0`, `rock_layer_y=500.0`.
- `Reader.read_double()` y `Reader.read_float32()` añadidos a `_reader.py`.
- `WldParseError(code="invalid_world_info")` lanzado si la sección 0 se trunca antes de los campos spawn/layer (T-31).

### Decisiones tomadas (iter-021)
- Via elegida: **B**, mantener soporte real acotado a v230-v279 y mejorar la UX del rechazo.
- `_MAX_VERSION` sigue en 279. Los mundos v319 lanzan `UnsupportedWorldVersionError` sin intentar parsear secciones desconocidas.
- `WldParseError` expone `details: dict[str, object]`.
- `UnsupportedWorldVersionError` expone `detected_version` y `supported_range`, ademas de conservar `version`.
- Fixture usada: `.wld` sintetico generado con `build_world(version=319)`, sin mundos reales.

### Decisiones tomadas (iter-020)
- `Tile.liquid` (int) reemplazado por `liquid_type: Literal["none","water","lava","honey","shimmer"]` y `liquid_amount: int`. Cambio breaking de contrato → v2.0.
- Shimmer detectado cuando `liquid_bits == 1` y `flags3 & 0x80`. Flags3 se lee solo cuando `flags2 & 0x01`; para shimmer, `_encode_liquid_tile` en el builder escribe `flags2=0x01, flags3=0x80`.
- `_encode_liquid_tile` añadido al builder para tiles aéreos con líquido. Water/lava/honey: 2 bytes `[flags1, amount]`. Shimmer: 4 bytes `[flags1|0x01, 0x01, 0x80, amount]`.
- Módulos dependientes (B2, B4, B5): ninguno accedía a `tile.liquid` → sin impacto. La deuda de actualizar `base64-rle-v2` para incluir `liquid_type+amount` queda registrada abajo.

### Decisiones tomadas (pre-iter-020)
- `Sign` se añadió al contrato (referenciado en `World` pero sin definir en v0).
- `TileGrid` implementada como lista de listas (`list[list[Tile]]`) sin numpy; rendimiento
  adecuado para el presupuesto de 10 s (el test T-08 pasa holgadamente).
- Tile `flags` = `flags2 | (flags3 << 8) | (flags4 << 16)` del formato binario (cables, slope, actuator y flags extendidos).
- `size` se clasifica por `width`: ≤4200 → small, ≤6400 → medium, >6400 → large.
- La fixture builder escribe archivos en formato v230-v319 usando el mismo orden de
  campos que el parser, garantizando round-trip exacto. Las versiones fuera de rango
  (100, 320) se rechazan inmediatamente tras leer la firma `relogic`.
- `wld_builder.py` vive en `tests/fixtures/` (no en `src/`); es infraestructura de test,
  no parte del dominio.
- **iter-019 (2026-04-28)**: `Tile.frame_x` y `Tile.frame_y` añadidos como `int | None`
  con default `None`. Solo se pueblan cuando `tfi[tile_id]` es true en el header del
  `.wld`; en tiles unframed o aire quedan `None`. Para `tile_id == 144` (Timers) se
  fuerza `frame_y = 0` replicando el comportamiento de `WorldFile.LoadTiles` de
  Terraria. Se añadieron a `wld_builder.build_world` los parámetros
  `tile_frame_at` y `frame_important_ids` para escribir TFI bits y los pares (U, V)
  vía `struct.pack("<hh", ...)`. Defaults `None` mantienen retrocompatibilidad con
  todos los `Tile(...)` ya construidos en otros módulos (B2/B4/B5).

### Deuda / follow-ups
- **Encoding `base64-rle-v2`**: el endpoint `GET /tiles` usa `base64-rle-v1` (solo `tile_id`). Para exponer `liquid_type`/`liquid_amount` al frontend, el encoding debe actualizarse a `base64-rle-v2` (8 bytes/tile). Esta deuda se resolverá en **iter API.1** (B5 + F3). Anotar allí que `liquid_type` se codifica como 3 bits (`none=0, water=1, lava=2, honey=3, shimmer=4`) + `liquid_amount` (1 byte).
- **Compatibilidad con mas mundos reales**: iter-026 valida corpus local `v279` y `v319`.
  Si aparecen mundos reales `v280-v318`, anadirlos al corpus y cubrir cualquier delta no
  observado antes de ampliar semantica expuesta por el dominio.
- **Formato global fuera de B1**: `ruff format src/ tests/ --check` detecta formato pendiente
  en `backend/tests/unit/world_repository/test_world_repository.py`. No se toca en esta
  iteracion por pertenecer a B2 `world-repository`.
- **numpy para TileGrid**: si el rendimiento de B4 tile-search resulta limitado por
  iteración Python sobre listas, sustituir `list[list[Tile]]` por un `ndarray` empaquetado.
- **NPCs**: ~~sección no parseada~~ **CERRADO iter-03 (2026-05-06)** con T-32..T-34 en `test_npcs.py`.
- **TileEntities / Footer**: secciones no parseadas; no son necesarias para el
  contrato actual pero podrían ser útiles para B2 o future work.

### Evolución propuesta para paridad con TerraMap

Referencia local acotada:
- `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io\resources\js\WorldLoader.js`
  - leer solo `readFileFormatHeader`, `readHeader`, `readTiles`, `readChests`, `readSigns`, `readNpcs`, `readTileEntity`, `readTileEntities`.
- `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io\resources\js\main.js`
  - leer solo `isTileMatch`, `getTileText`, `getItemText`, `onWorldLoaderWorkerMessage`.

Brechas actuales:
- `WorldMetadata` ya expone `spawn_x/spawn_y`, `world_surface_y`, `rock_layer_y` y `hell_layer_y` desde iter-02.
- `World` ya modela NPCs desde iter-03; todavía no modela tile entities. TerraMap los usa para tile info y búsqueda de items en frames/racks/mannequins/hat racks.
- El rango v230-v319 ya acepta el corpus real actual. Queda ampliar semantica de campos no expuestos si B2/B4/B5 lo necesitan.

Contrato v2/v2.2 (parcialmente implementado):
- `Tile.frame_x/frame_y`: implementado en iter-019.
- `Tile.liquid_type/liquid_amount`: implementado en iter-020 (este iter).
- ~~Pendiente: ampliar `WorldMetadata` con `spawn_x`, `spawn_y`, `world_surface_y`, `rock_layer_y`, `hell_layer_y`.~~ **CERRADO iter-02 (2026-05-06)** — T-26..T-31 en `test_metadata_extended.py`.
- ~~Pendiente: añadir `Npc` y `World.npcs`.~~ **CERRADO iter-03 (2026-05-06)** — T-32..T-34 en `test_npcs.py`.
- añadir `TileEntityItem`, `TileEntity` y `World.tile_entities`.
- mantener compatibilidad de lectura para chests/signs y no hacer que B2/B4 dependan de detalles internos no documentados.

Tests mínimos futuros:
- parsear un tile frame-important y comprobar `frame_x/frame_y`.
- parsear cada tipo de líquido soportado.
- ~~parsear un NPC town simple.~~ **CERRADO iter-03 (2026-05-06)**.
- parsear tile entity con item simple (item frame o weapon rack).
- parsear tile entity con inventario múltiple (mannequin o hat rack).
- ampliar el corpus con mundos reales adicionales de `v280-v318` si aparecen.

Estado: NPCs implementado; tile entities planificado, no implementado.
