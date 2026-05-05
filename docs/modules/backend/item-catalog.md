# Módulo `B3 – item-catalog`

## 1. Propósito
Exponer el catálogo de ítems de Terraria: búsqueda por texto, lectura por id, URL de sprite. Fuente: wiki oficial (wiki.gg). Se cachea en disco y se expone vía un repositorio en memoria.

## 2. Contrato público

```python
@dataclass(frozen=True)
class ItemSummary:
    id: int
    name: str
    sprite_url: str
    category: str

@dataclass(frozen=True)
class ItemDetail(ItemSummary):
    rarity: int
    tooltip: str | None

class ItemCatalog(Protocol):
    def search(self, query: str, limit: int = 20) -> list[ItemSummary]: ...
    def get(self, item_id: int) -> ItemDetail: ...

class ItemNotFoundError(Exception): ...
class ItemCatalogUnavailableError(Exception): ...

def create_catalog_from_cache(cache_path: Path) -> ItemCatalog: ...
def load_catalog(cache_path: Path, seed_path: Path | None = None) -> ItemCatalog: ...
async def refresh_cache_from_wiki(cache_path: Path, client: HttpClient) -> None: ...
```

### Búsqueda (`search`)

`search(query: str, limit: int = 20) -> list[ItemSummary]` mantiene una única
entrada de texto y decide la rama de búsqueda a partir de `query.strip()`:

1. Si la query parsea como entero decimal positivo (`> 0`), se interpreta como
   `item_id` y hace match exacto por id. Devuelve una lista de 0 o 1 elementos y
   respeta la misma forma de respuesta que la búsqueda por nombre.
2. Si la query no parsea como entero positivo, se interpreta como texto y hace
   match por nombre normalizado (case-insensitive y diacritic-insensitive), con
   orden prefijo > substring > id asc.
3. Si la query está vacía o contiene solo espacios, devuelve `[]`.

Enteros negativos y números que desborden el rango soportado por la rama de id
no son errores de validación: caen a la rama de nombre normalizado.

### Orden de carga (`load_catalog`)

1. `cache_path` (env `TWI_ITEM_CACHE_PATH`) — si existe y esquema válido.
2. `seed_path` (env `TWI_ITEM_SEED_PATH`, default: paquete bundled `item_catalog/data/items.seed.json`) — fallback con WARNING.
3. `ItemCatalogUnavailableError` — si ambos fallan; `_NullCatalog` en `app.py`.

Seed bundled: `backend/src/twi/item_catalog/data/items.seed.json` (schema v1, ~12 ítems). Regenerar con `refresh_cache_from_wiki` para catálogo completo.

## 3. Dependencias
- Stdlib: `json`, `pathlib`, `dataclasses`.
- Externas: `httpx` (async), `beautifulsoup4` o `selectolax` para scraping.
- La ruta del cache se define por env `TWI_ITEM_CACHE_PATH` (default `data/items.json`).

## 4. No objetivos
- No descarga sprites; solo almacena la URL.
- No se acopla a FastAPI.
- No realiza fuzzy matching complejo; búsqueda por prefijo + substring suficiente en v1.

## 5. Especificación (SDD)
- **SP-01** `search("zen")` devuelve `ItemSummary` cuyo `name` empieza o contiene "zen" (case-insensitive), ordenado por relevancia (prefijo > substring > id asc).
- **SP-02** `search` respeta `limit`.
- **SP-03** `get(id)` devuelve el `ItemDetail` correspondiente.
- **SP-04** `get` con id inexistente lanza `ItemNotFoundError`.
- **SP-05** `refresh_cache_from_wiki` escribe un JSON con esquema versionado (`{"schema": 1, "items": [...]}`).
- **SP-06** `create_catalog_from_cache` con cache ausente lanza `FileNotFoundError`. Con cache de esquema desconocido, lanza `ValueError`.
- **SP-07** La búsqueda es diacritic-insensitive (`"Chloro"` matchea `"Chlorophyte"`).
- **SP-08** `load_catalog(cache, seed)` intenta `cache` primero; si falla (`FileNotFoundError` o `ValueError`), usa `seed` con un WARNING; si ambos fallan, lanza `ItemCatalogUnavailableError`.
- **SP-09** Seed bundled en el paquete (`item_catalog/data/items.seed.json`, schema v1) garantiza arranque sin catálogo vacío incluso con volumen vacío en Docker.
- **SP-10** `search("4956")` devuelve exactamente el ítem con `id=4956` si existe; `search("0001")` resuelve `id=1`.
- **SP-11** `search("")` y `search("   ")` devuelven `[]`.
- **SP-12** `search("-1")`, queries numéricas que desborden la rama de id y queries mixtas como `"4956a"` usan la rama de nombre normalizado.

## 6. Plan de tests (TDD)
- [x] `T-01 test_search_prefix_match_returns_item`
- [x] `T-02 test_search_is_case_insensitive`
- [x] `T-03 test_search_respects_limit`
- [x] `T-04 test_search_orders_prefix_before_substring`
- [x] `T-05 test_get_returns_item_detail`
- [x] `T-06 test_get_unknown_id_raises_ItemNotFoundError`
- [x] `T-07 test_create_catalog_from_cache_invalid_schema_raises`
- [x] `T-08 test_refresh_cache_writes_versioned_json` (mockear `HttpClient`)
- [x] `T-09 test_refresh_cache_parses_sample_wiki_html_page` (fixture HTML local)
- [x] `T-10 test_load_catalog_uses_cache_when_present`
- [x] `T-11 test_load_catalog_falls_back_to_seed_and_logs_warning`
- [x] `T-12 test_load_catalog_raises_when_both_absent`
- [x] `T-13 test_load_catalog_falls_back_to_seed_when_cache_invalid_schema`
- [x] `T-14 test_load_catalog_raises_when_no_seed_and_cache_absent`
- [x] `T-15 test_search_numeric_returns_item_by_id`
- [x] `T-16 test_search_alpha_returns_by_name`
- [x] `T-17 test_search_zero_padded_id`
- [x] `T-18 test_search_unknown_id_returns_empty`
- [x] `T-19 test_search_empty_query_returns_empty`
- [x] `T-20 test_search_negative_or_overflow_falls_back_to_name`
- [x] `T-21 test_search_mixed_alphanumeric_uses_name_branch`
- [x] `T-22 test_refresh_cli_creates_output_parent_and_runs`

### Tests de integración (separados, no en ciclo TDD)
- [x] `IT-01 test_items_query_dirt_returns_results_from_seed` (`tests/integration/test_item_catalog_seed.py`)
- [x] `IT-02 test_items_query_empty_returns_empty_items`

## 7. Notas de implementación
- La lista de ítems de Terraria es finita (~5000). Se carga entera en memoria.
- Índices: `dict[int, ItemDetail]` por id precomputado para `get` y búsqueda exacta por id, `list[tuple[str_normalizado, ItemSummary]]` para búsqueda por nombre.
- Normalización: `unicodedata.normalize("NFKD", s).encode("ascii","ignore").decode().lower()`.
- Para scraping, preferir endpoints "List of items" o la plantilla de datos de la wiki si existe dump estructurado. Incluir User-Agent con contacto.
- Como fallback ante wiki caída: mantener un `items.fallback.json` versionado en el repo.

## 8. Performance
- `search` O(n) en v1 sobre ~5000 ítems. Tiempo < 5 ms. Si escala mal, trigram index.

## 9. Errores
- `ItemNotFoundError(item_id)`.
- `ValueError` en cache de schema desconocido.
- `httpx.HTTPError` propagado desde `refresh_cache_from_wiki`.

## 10. Estado
- **Versión del contrato**: v1.2
- **Último cierre**: 2026-05-05 (iter-028)
- **Iteración actual**: cerrada
- **Cambios iter-028**:
  - `search(query)` ahora distingue query vacía, búsqueda exacta por `item_id` positivo y búsqueda por nombre normalizado.
  - Se añadió soporte para IDs con ceros a la izquierda (`"0001"` -> `id=1`).
  - Enteros negativos, overflow de la rama de id y queries mixtas alfanuméricas caen a búsqueda por nombre.
  - El índice `dict[int, ItemDetail]` queda documentado como índice precomputado para `get` y búsqueda exacta por id.
- **Cambios iter-018**:
  - `scraper.py`: actualizado para tabla `class="terraria lined sortable"` (wiki cambió de `wikitable`). Detecta `terraria` primero, cae a `wikitable`, luego a primera tabla en `mw-content-text`. Columnas nuevas: ID | Name | Internal name — category/rarity/tooltip/sprite_url pasan a defaults vacíos.
  - `items.seed.json`: reemplazado de 12 ítems (minimal) a **6146 ítems** (catálogo completo de wiki.gg, 2026-04-28).
  - `refresh.py`: creado `python -m twi.item_catalog.refresh [--output PATH]` para regenerar el seed en el futuro.
  - Fixture `sample_wiki_items.html` actualizado a estructura real de la wiki.
  - T-09 actualizado (id=1 es "Iron Pickaxe", se eliminó aserción de sprite_url).
- **Deuda / follow-ups**:
  - sprite_url siempre vacío (wiki eliminó columna de sprites). Si se quieren sprites, habría que scrapear páginas individuales por ítem — fuera de alcance v1.
  - category/rarity/tooltip siempre vacíos/defaults — misma causa. Impacto: `GET /api/items/{id}` devuelve rarity=0 y tooltip=null para todos.
  - `refresh_cache_from_wiki` propaga `httpx.HTTPError` ante wiki caída; en primer arranque sin red solo cuenta el seed bundled.
  - Seed debe regenerarse (`python -m twi.item_catalog.refresh`) si la wiki añade nuevos ítems.
