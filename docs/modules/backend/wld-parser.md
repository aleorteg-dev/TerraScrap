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
    liquid: int                 # 0..255
    flags: int                  # bitmask

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
class World:
    metadata: WorldMetadata
    tiles: TileGrid                 # abstracción read-only, indexable [x][y]
    chests: tuple[Chest, ...]
    signs: tuple[Sign, ...]
```

### 2.2. Funciones
```python
def parse_wld(stream: BinaryIO) -> World: ...
def parse_wld_bytes(data: bytes) -> World: ...

class WldParseError(Exception): ...
class UnsupportedWorldVersionError(WldParseError): ...
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
Fixtures sintéticas bajo `backend/tests/fixtures/wld/` generadas por helpers (no usar mundos reales).

- [ ] `T-01 test_parse_empty_minimal_world_returns_expected_metadata`
- [ ] `T-02 test_parse_reads_tiles_as_grid_with_expected_dimensions`
- [ ] `T-03 test_parse_air_tile_has_none_tile_id`
- [ ] `T-04 test_parse_chest_items_returns_40_slots_with_empty_slots_zeroed`
- [ ] `T-05 test_parse_rejects_invalid_header_with_WldParseError`
- [ ] `T-06 test_parse_rejects_unsupported_version_with_UnsupportedWorldVersionError`
- [ ] `T-07 test_parse_is_deterministic_same_bytes_equal_world`
- [ ] `T-08 test_parse_large_synthetic_world_completes_within_budget` (marca `@pytest.mark.perf`)

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
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —