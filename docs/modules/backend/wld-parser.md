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

@dataclass(frozen=True)
class Tile:
    tile_id: int | None        # bloque colocado (None = aire)
    wall_id: int | None
    liquid_type: Literal["none", "water", "lava", "honey", "shimmer"]  # tipo de líquido
    liquid_amount: int          # 0..255; 0 cuando liquid_type == "none"
    flags: int                  # bits de flags2 | (flags3 << 8): cables, slope, actuator
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
```

### 2.2. Funciones
```python
def parse_wld(stream: BinaryIO) -> World: ...
def parse_wld_bytes(data: bytes) -> World: ...

class WldParseError(Exception):
    code: str | None  # "invalid_header" | "truncated" | "corrupt" | "unsupported_version"

class UnsupportedWorldVersionError(WldParseError):
    version: int
```

Rango de versiones soportado v1: **>= 230 y <= 279** (ajustar tras pruebas). Fuera de rango → `UnsupportedWorldVersionError`.

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

## 7. Notas de implementación
- El `.wld` es binario little-endian. Secciones principales (en orden aproximado): Header, Tiles, Chests, Signs, NPCs, Tile Entities, Footer.
- Para tiles, Terraria usa un esquema RLE por columnas con un byte de flags que indica presencia de bloque, pared, líquido, cables, etc. Implementar **solo** lo necesario para reconstruir `Tile`.
- Implementar primero un generador de `.wld` sintético minimal bajo `tests/fixtures/wld_builder.py` que escriba cabecera y un grid pequeño; los tests del parser trabajan contra ese builder. Eso evita depender de ficheros reales enormes.
- Referencia viva: implementaciones open-source (TEdit, Terramap) para corroborar el layout binario. **No copiar código**; usar solo como referencia de formato.

## 8. Performance
- Target: mundo *large* (8400×2400) < 10 s; memoria pico < 1 GB.
- Evitar listas de dicts; usar arrays homogéneos / `numpy` si se necesita.

## 9. Errores
- `WldParseError`: cabecera inválida, EOF inesperado, sección corrupta.
- `UnsupportedWorldVersionError`: fuera de rango soportado. `version: int` como atributo.

## 10. Estado
- **Versión del contrato**: v2.0
- **Último cierre**: 2026-04-28
- **Iteración actual**: iter-020
- **Tests**: 19/19 ✓ — mypy --strict ✓ (módulo B1; ver Deuda) — ruff ✓ — perf budget (large world) ✓

### Decisiones tomadas (iter-020)
- `Tile.liquid` (int) reemplazado por `liquid_type: Literal["none","water","lava","honey","shimmer"]` y `liquid_amount: int`. Cambio breaking de contrato → v2.0.
- Shimmer detectado cuando `liquid_bits == 1` y `flags3 & 0x80`. Flags3 se lee solo cuando `flags2 & 0x01`; para shimmer, `_encode_liquid_tile` en el builder escribe `flags2=0x01, flags3=0x80`.
- `_encode_liquid_tile` añadido al builder para tiles aéreos con líquido. Water/lava/honey: 2 bytes `[flags1, amount]`. Shimmer: 4 bytes `[flags1|0x01, 0x01, 0x80, amount]`.
- Módulos dependientes (B2, B4, B5): ninguno accedía a `tile.liquid` → sin impacto. La deuda de actualizar `base64-rle-v2` para incluir `liquid_type+amount` queda registrada abajo.

### Decisiones tomadas (pre-iter-020)
- `Sign` se añadió al contrato (referenciado en `World` pero sin definir en v0).
- `TileGrid` implementada como lista de listas (`list[list[Tile]]`) sin numpy; rendimiento
  adecuado para el presupuesto de 10 s (el test T-08 pasa holgadamente).
- Tile `flags` = `flags2 | (flags3 << 8)` del formato binario (cables, slope, actuator).
- `size` se clasifica por `width`: ≤4200 → small, ≤6400 → medium, >6400 → large.
- La fixture builder escribe archivos en formato v230-v279 usando el mismo orden de
  campos que el parser, garantizando round-trip exacto. Las versiones fuera de rango
  (100, 300) se rechazan inmediatamente tras leer la firma `relogic`.
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
- **mypy `no-redef` en `tile_search/_engine.py:109,112`**: pre-existente al iter-019,
  no causado por los cambios de B1; reasignación de `tile_map`/`wall_map` con anotación
  en la rama `else` tras un binding sin anotación en el `if`. Pertenece a B4
  tile-search, no se toca aquí. Anotado para que la próxima iteración de B4 lo limpie
  (basta con anotar la rama `if` o reestructurar el binding).
- **Compatibilidad con mundos reales**: el parser fue validado contra fixtures sintéticas.
  Una iteración de integración debería probarse con un `.wld` real de Terraria 1.4.4 para
  verificar que el orden de campos en el header sección 0 coincide exactamente.
  (Riesgo: algún campo intermedio para versiones específicas podría estar en posición
  distinta en mundos generados por el juego vs. la especificación implementada.)
- **numpy para TileGrid**: si el rendimiento de B4 tile-search resulta limitado por
  iteración Python sobre listas, sustituir `list[list[Tile]]` por un `ndarray` empaquetado.
- **NPC / TileEntities / Footer**: secciones no parseadas; no son necesarias para el
  contrato actual pero podrían ser útiles para B2 o future work.
- **Walls > 255**: la lógica del byte alto de wall (flags3 bit 2) está implementada
  pero no cubierta por tests; añadir un test específico en una iteración futura.

### Evolución propuesta para paridad con TerraMap

Referencia local acotada:
- `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io\resources\js\WorldLoader.js`
  - leer solo `readFileFormatHeader`, `readHeader`, `readTiles`, `readChests`, `readSigns`, `readNpcs`, `readTileEntity`, `readTileEntities`.
- `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io\resources\js\main.js`
  - leer solo `isTileMatch`, `getTileText`, `getItemText`, `onWorldLoaderWorkerMessage`.

Brechas actuales:
- `Tile` no conserva `frame_x/frame_y` (`TextureU/TextureV` en TerraMap). Sin esos campos, varios muebles/objetos colocados no se pueden distinguir solo por `tile_id`.
- `Tile` conserva `liquid` como cantidad pero no tipo de líquido (`water/lava/honey/shimmer`), lo que limita el render.
- `WorldMetadata` no expone `spawn_x/spawn_y`, `world_surface_y`, `rock_layer_y` ni `hell_layer_y`, necesarios para centrar y pintar capas como TerraMap.
- `World` no modela NPCs ni tile entities. TerraMap los usa para lista de NPCs, tile info y búsqueda de items en frames/racks/mannequins/hat racks.
- El rango actual v230-v279 rechaza mundos recientes. TerraMap contiene ramas para versiones posteriores (por ejemplo `>=287`, `>=299`, `>=304`). Revisar soporte 1.4.5+ usando offsets de sección para saltar datos no modelados.

Contrato v2 (parcialmente implementado — iter-020):
- `Tile.frame_x/frame_y`: implementado en iter-019.
- `Tile.liquid_type/liquid_amount`: implementado en iter-020 (este iter).
- Pendiente: ampliar `WorldMetadata` con `spawn_x`, `spawn_y`, `world_surface_y`, `rock_layer_y`, `hell_layer_y`.
- ampliar `WorldMetadata` con `spawn_x`, `spawn_y`, `world_surface_y`, `rock_layer_y`, `hell_layer_y`.
- añadir `Npc`, `TileEntityItem`, `TileEntity` y `World.tile_entities`.
- mantener compatibilidad de lectura para chests/signs y no hacer que B2/B4 dependan de detalles internos no documentados.

Tests mínimos futuros:
- parsear un tile frame-important y comprobar `frame_x/frame_y`.
- parsear cada tipo de líquido soportado.
- parsear un NPC town simple.
- parsear tile entity con item simple (item frame o weapon rack).
- parsear tile entity con inventario múltiple (mannequin o hat rack).
- aceptar una versión reciente soportada o devolver error explícito con versión y motivo.

Estado: planificado, no implementado.
