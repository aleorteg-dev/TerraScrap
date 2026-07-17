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

@dataclass(frozen=True)
class TileEntity:
    id: int
    entity_type: int          # 0..10; unknown types are warned and skipped
    x: int
    y: int
    data: dict[str, int | str]  # type-specific fields; see §5 for key names

class TileGrid:                     # read-only, indexable grid[x][y] -> Tile
    width: int
    height: int
    def __getitem__(self, x: int) -> Sequence[Tile]: ...
    # v2.7 (IT-15, E19 — breaking menor): TileGrid NO es hashable
    # (hash(grid) lanza TypeError: implicaría visitar los ~20M de tiles) y la
    # igualdad es por identidad (sin __eq__ estructural). Para comparar grids
    # en tests, usar un helper tipo assert_grids_equal(a, b) columna a columna.

@dataclass(frozen=True)
class World:
    metadata: WorldMetadata
    tiles: TileGrid
    chests: tuple[Chest, ...]
    signs: tuple[Sign, ...]
    npcs: list[Npc]
    tile_entities: list[TileEntity]   # empty list for worlds with 0 entities
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
- `v280-v283`: section 2 usa layout moderno de chests (`itemCount:int32` por chest). Esta frontera `>279` es inferida del corpus: v279 conserva `chestSize:int16` global y v319 sigue `readChests` de `WorldLoader.js`.
- `v284-v286`: además añade `lastPlayed:int64` en section 0 (ver entrada `v284+` más arriba).
- `v287-v288`: section 0 anade `forceHalloweenForever`, `forceXMasForever` (`>=287`) y `vampireSeed` (`>=288`) en la cola de header.
- `v291-v295`: section 0 anade `_tempMeteorShowerCount:int32` y `_tempCoinRain:int32` (`>=291`).
- `v296-v298`: section 0 anade `infectedSeed:uint8` (`>=296`) y `teamBasedSpawnsSeed:uint8` + lista variable de pares `int16,int16` (`>=297`).
- `v299-v301`: section 0 anade `manifest:string` (`>=299`) y un `uint32` heredado para `>=299 && <313`.
- `v284+`: section 0 incluye `lastPlayed:int64` justo después de `creationTime:int64` y antes de `moonType:uint8`. Sin este campo, `spawnX`, `spawnY`, `worldSurfaceY` y `rockLayerY` quedan desplazados 8 bytes y producen valores denormales (~9.63e-312).
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
- [x] `T-35 test_parse_zero_tile_entities_returns_empty_list` (iter-04)
- [x] `T-36 test_parse_tile_entity_type0_target_dummy` (iter-04)
- [x] `T-37 test_parse_tile_entity_type1_item_frame` (iter-04)
- [x] `T-37b test_parse_tile_entity_type4_weapon_rack_has_item_fields` (iter-04)
- [x] `T-38 test_parse_tile_entity_type2_logic_sensor` (iter-04)
- [x] `T-39 test_parse_tile_entity_type7_pylon_data_is_empty` (iter-04)
- [x] `T-40 test_parse_tile_entity_type3_mannequin_empty_slots` (iter-04)
- [x] `T-41 test_parse_tile_entity_type5_hat_rack_empty_slots` (iter-04)
- [x] `T-42 test_parse_unknown_tile_entity_type_emits_warning_no_exception` (iter-04)
- [x] `T-43 test_parse_entities_before_unknown_type_are_kept` (iter-04)
- [x] `T-44 test_wld_builder_add_tile_entity_round_trip` (iter-04)
- [x] `T-45 test_parse_multibyte_wall_id_round_trips` (iter-05)
- [x] `T-46 test_parse_footer_invalid_flag_raises_invalid_footer` (iter-05)
- [x] `T-47 test_parse_footer_truncated_raises_invalid_footer` (iter-05)
- [x] `T-48 test_parse_footer_name_mismatch_raises_invalid_footer` (iter-05)
- [x] `T-49 test_parse_footer_uses_last_offset_when_extra_sections_present` (iter-06)
- [x] `T-50 test_parse_v319_real_world_footer_validates_correctly` (iter-06, integration)
- [x] `T-51 test_parse_sign_with_cp1252_text_falls_back_gracefully` (iter-07)
- [x] `T-52 test_parse_two_npcs_in_v279_world_roundtrip_correctly` (iter-07)

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
- **Versión del contrato**: v2.7 (IT-15 🔶: `TileGrid` no hashable/sin eq estructural; decodificación de strings garantizada sin excepción)
- **Último cierre**: 2026-07-17 — IT-15 (PLAN_REMEDIACION E11+E19+M08+D06+G08)

### Cambios IT-15 🔶

- E11 — `read_net_string`: la cadena de decodificación es `utf-8` →
  `cp1252` → `latin-1`. El comentario antiguo ("cp1252 decodes every byte
  sequence") era falso: 0x81, 0x8D, 0x8F, 0x90 y 0x9D no están definidos en
  cp1252 y lanzaban `UnicodeDecodeError` (→ `WldParseError` corrupt). latin-1
  decodifica cualquier byte, así que la decodificación **nunca** lanza.
- E19 — eliminados `TileGrid.__eq__`/`__hash__` estructurales (breaking
  menor): el hash construía una tupla con los ~20M de tiles. `hash(grid)`
  ahora lanza `TypeError` explícito; la igualdad es por identidad. Tests
  adaptados con `assert_grids_equal`.
- M08 — `except (WldParseError, UnsupportedWorldVersionError)` simplificado a
  `except WldParseError` (la segunda es subclase de la primera).
- D06 — rango soportado con fuente única: `_constants.py` define
  `MIN_SUPPORTED_VERSION = 230` / `MAX_SUPPORTED_VERSION = 319`; tanto el
  parser como el default de `UnsupportedWorldVersionError` los consumen (el
  default ya no puede quedar desfasado en silencio).
- G08 — `_classify_size(...) -> Literal["small", "medium", "large"]`;
  eliminado el `# type: ignore[arg-type]`.
- **Iteración actual**: iter-07
- **Tests**: `python -m pytest tests/unit/wld_parser -q` verde (60/60). `mypy src/twi/wld_parser --strict` sin errores. `ruff check` y `ruff format --check` sin warnings. Integración: todos los mundos del corpus pasan. Cobertura B1: ≥90%.

### Decisiones tomadas (iter-07 / 2026-05-11)
- **Bug 1 — signs encoding**: `read_net_string` usaba `utf-8` puro; algunos mundos reales (v279 Windows) almacenan textos de carteles en cp1252. Fix: intentar utf-8, fallback a cp1252 (nunca falla). `Gotear_Tierras_llanas.wld` parseaba hasta signs y lanzaba `WldParseError(code='corrupt')`.
- **Bug 2 — homelessDespawn gate**: `_read_town_npc` leía `homelessDespawn: bool` para todas las versiones, pero el campo no existe en v279. Esto desalineaba la lectura de NPCs consecutivos, causando IDs y coordenadas basura en el NPC 2+, y eventualmente `WldParseError(code='invalid_npc')`. Fix: gate `_NPC_HOMELESS_DESPAWN_VERSION = 280` en parser y builder.
- Contrato no cambia. `Sign.text` puede devolver texto con caracteres cp1252 decodificados a Unicode; eso es correcto.
- `wld_builder._build_section3` actualizado: `_net_bytes` helper para bytes raw, `SignSpec.text_bytes` override para tests de encoding no-UTF-8.
- T-51 (unit sign cp1252) + T-52 (unit NPC v279 doble round-trip). Todos los corpus parsean sin error.

### Decisiones tomadas (iter-06 / 2026-05-11)
- **Bug corregido**: `_validate_footer` usaba `offsets[6]` como offset del footer. En mundos con `num_sections > 7` (p. ej. v319 con 11 secciones), el footer vive en `offsets[-1]`, no `offsets[6]`. El parseo fallaba con `"Footer validation failed: flag=False, name='', id=0"`.
- **Fix**: `r.seek(offsets[6])` → `r.seek(offsets[-1])` en `_parser.py`. Footer es siempre la última sección; `offsets[-1]` es correcto para cualquier `num_sections ≥ 7`.
- **Builder extendido**: `build_world` acepta `extra_sections: int = 0`. Cada sección extra recibe 1 byte de payload nulo para que sus offsets sean distintos del footer (condición necesaria para que el test sintético reproduzca el bug).
- **Contrato**: no cambia. Footer format sigue siendo `bool(flag=1) + .NET string(name) + int32(world_id)` — offset en `offsets[-1]` (no `offsets[6]`).
- T-49 (unit) en `test_footer_and_walls.py` + T-50 (integration) en `test_real_wld_parser.py`. 58 tests unitarios + 1 integración adicional.

### Decisiones tomadas (iter-05 / 2026-05-09)
- `Tile` ya exponía `wall_id`, `liquid_type`, `liquid_amount`, `frame_x`, `frame_y`; ningún campo nuevo requerido.
- Multi-byte `wall_id` (>255): implementación ya correcta (`flags3 & 0x40` + byte alto); añadido T-45 para documentar/garantizar.
- Footer validado al final de `parse_wld` vía `_validate_footer(r, offsets, metadata.name, world_id)`.
  - Footer format: `bool(flag=1) + .NET string(name) + int32(world_id)` — offset en `offsets[-1]` (corregido en iter-06; antes se usaba `offsets[6]`).
  - `WldParseError(code="invalid_footer")` en tres casos: `len(offsets) < 7`, datos truncados, o `flag≠1/name≠world_name/id≠world_id`.
- `_read_world_info` ahora devuelve `tuple[WorldMetadata, int]`; el segundo valor es `world_id` (interno, no expuesto en contrato público).
- Builder actualizado: emite 7 secciones (`num_sections=7`) con `_build_section6_footer(name, world_id=1)`. `header_size` ajustado (+4 bytes por el offset extra). Todos los tests existentes pasan sin modificación gracias a que el footer se emite y valida correctamente.
- T-45..T-48 en `test_footer_and_walls.py`. 57 tests totales.

### Decisiones tomadas (iter-04 / 2026-05-07)
- `TileEntity` añadido al contrato con `id`, `entity_type`, `x`, `y`, `data: dict[str, int | str]`.
- `World.tile_entities: list[TileEntity]` con `default_factory=list` para compatibilidad retroactiva con B2/B4/B5 que no lo proveen.
- Sección 5 (tile entities) leída desde `offsets[5]` si `len(offsets) >= 6`; mundos de 5 secciones (pre-iter-04) quedan con `tile_entities=[]`.
- Builder actualizado a 6 secciones; `_build_section5` serializa entidades con payload raw.
- Tipos soportados: 0 (target dummy), 1/4/6/8 (single item), 2 (logic sensor), 3 (mannequin), 5 (hat rack), 7 (pylon), 9/10 (kite/critter anchor).
- Tipo desconocido (>10): `logging.warning` estructurado + interrupción del bucle; no se lanza excepción.
- `data` keys por tipo documentadas en §5; para mannequin: `item_N_id/prefix/stack` (N 0-8), `dye_N_id/prefix/stack` (N 0-8), `misc_0_id/prefix/stack`, `pose`. Para hat rack: `item_N_id/prefix/stack` y `dye_N_id/prefix/stack` (N 0-1).
- `WldBuilder.add_tile_entity(entity_type, x, y, payload)` + helpers `te_*` en `wld_builder.py`.
- T-35..T-44 verdes (11 tests nuevos). Todos en `test_tile_entities.py`.

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

### Decisiones tomadas (iter-020)
- `Tile.liquid` (int) reemplazado por `liquid_type: Literal["none","water","lava","honey","shimmer"]` y `liquid_amount: int`. Cambio breaking de contrato → v2.0.
- Shimmer detectado cuando `liquid_bits == 1` y `flags3 & 0x80`. Flags3 se lee solo cuando `flags2 & 0x01`; para shimmer, `_encode_liquid_tile` en el builder escribe `flags2=0x01, flags3=0x80`.
- `_encode_liquid_tile` añadido al builder para tiles aéreos con líquido. Water/lava/honey: 2 bytes `[flags1, amount]`. Shimmer: 4 bytes `[flags1|0x01, 0x01, 0x80, amount]`.
- Módulos dependientes (B2, B4, B5): ninguno accedía a `tile.liquid` → sin impacto.

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

### Decisiones tomadas (iter-08 / 2026-06-11)
- **Bug — lastPlayed offset**: para `version >= 284` existe `lastPlayed:int64` entre `creationTime` y `moonType`. El parser no lo leía, desplazando 8 bytes todos los campos posteriores (`spawnX`, `spawnY`, `worldSurfaceY`, `rockLayerY`). Síntoma: `worldSurfaceY ≈ 9.63e-312` (valor denormal al interpretar bytes del campo int64 como double). Fix: `if version >= 284: r.read_int64()` en `_read_world_info`, justo tras leer `_creation_time`. Builder `_build_section0` actualizado igual: `if version >= 284: buf += struct.pack("<q", 0)`. Validado contra valores reales de `El_Ínsula_Ultranervioso.wld` (v319): `spawn=(2104,261)`, `worldSurfaceY=337.0`, `rockLayerY=517.0`.
- Contrato público no cambia. T-53 añadido en `test_metadata_extended.py`; `test_parse_v319_real_world_ok` extendido con aserciones de spawn/surface/rock.

### Deuda / follow-ups
- **Compatibilidad con mas mundos reales**: iter-026 valida corpus local `v279` y `v319`.
  Si aparecen mundos reales `v280-v318`, anadirlos al corpus y cubrir cualquier delta no
  observado antes de ampliar semantica expuesta por el dominio.
- **numpy para TileGrid**: si el rendimiento de B4 tile-search resulta limitado por
  iteración Python sobre listas, sustituir `list[list[Tile]]` por un `ndarray` empaquetado.
- ~~**Background styles del header v0.x del `.wld`**~~ — Cerrado iter
  moss-2026-06-11. `WorldMetadata` ahora expone `BackgroundStyles` con
  `moon_style`, `tree_x[3]`, `tree_style[4]`, `cave_back_x[3]`,
  `cave_back_style[4]`, `ice_back_style`, `jungle_back_style`, `hell_back_style`.
  Los enteros viajan crudos vía `WorldMetadataDto.background_styles` (Optional;
  fixtures legacy mantienen `None`). El frontend recibe los IDs y traduce
  estilo→hex en `tileColors.ts` cuando se priorice paridad visual por bioma.

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
- mantener compatibilidad de lectura para chests/signs y no hacer que B2/B4 dependan de detalles internos no documentados.

Tests mínimos futuros:
- ampliar el corpus con mundos reales adicionales de `v280-v318` si aparecen.

Estado: NPCs implementado (iter-03). Tile entities implementado (iter-04).
