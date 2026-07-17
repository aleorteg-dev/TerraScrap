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
async def refresh_cache_from_wiki(
    cache_path: Path, client: HttpClient, *, enrich: bool = False
) -> None: ...

class WikiUnavailableError(Exception): ...   # 5xx o timeout agotado tras 3 reintentos
class WikiSchemaChangedError(Exception): ... # tabla / selector roto en el HTML
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
- [x] `T-23 test_scraper_enriches_items_with_extended_fields`
- [x] `T-24 test_scraper_timeout_retries_then_raises_unavailable`
- [x] `T-25 test_scraper_per_item_404_skips_and_continues`
- [x] `T-26 test_scraper_5xx_raises_unavailable_does_not_write_cache`
- [x] `T-27 test_scraper_table_missing_raises_schema_changed`
- [x] `T-28 test_load_catalog_uses_seed_when_scraping_fails`
- [x] `T-29 test_refresh_writes_versioned_seed_file`
- [x] `T-30 test_bundled_v2_seed_loads`

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
- **Versión del contrato**: v1.3 (IT-17 no cambia el contrato público)
- **Último cierre**: 2026-07-17 — IT-17 (PLAN_REMEDIACION M05+M06+M07+G07)
- **Iteración actual**: cerrada

### Cambios IT-OPT-6 (sin cambio de contrato)

- P09 — `_enrich_items` deja de ser secuencial (6 146 páginas una a una): las
  peticiones por ítem corren en paralelo acotado con
  `asyncio.Semaphore(_ENRICH_CONCURRENCY = 6)` + `gather`. El backoff por
  petición sigue viviendo en `_get_with_retry`. Semántica preservada: 404 →
  skip con warning; el primer 5xx sigue abortando con `WikiUnavailableError`
  (se recogen resultados con `return_exceptions=True` y se relanza la primera
  excepción; la caché no se escribe). Solo afecta al CLI `refresh.py`.

### Cambios IT-17 (sin cambio de contrato)

- M05 — `_parse_id`: `except (ValueError, OverflowError)` → `except ValueError`
  (`int(str)` nunca lanza `OverflowError`).
- M06 — eliminado el `try/except WikiUnavailableError: raise` no-op de
  `_enrich_items`.
- M07 — `_get_with_retry`: `except (httpx.TimeoutException,
  httpx.TransportError)` → `except httpx.TransportError`
  (`TimeoutException` es subclase).
- G07 — sin `Any` explícito: `catalog.py` lee la caché como
  `_CachePayload`/`_CacheItem` (TypedDict, `total=False` — la validación
  runtime sigue siendo los `int()`/`str()` defensivos); `scraper.py` tipa los
  items como `_ScrapedItem` y el resultado de `_parse_item_detail` como
  `_ItemPatch` (TypedDict parcial).
- **Decisión — `item_id` duplicado en la fuente** (antes: `_by_id` pisaba en
  silencio con el último y `_index` conservaba ambos, respuestas
  inconsistentes entre `get` y `search`): se **dedupe conservando la primera
  entrada** (coherente con el criterio primer-gana de IT-14) con WARNING en
  log; los duplicados no se indexan.
- **Cambios iter-13**:
  - Scraper endurecido: `WikiUnavailableError` (5xx o timeout tras 3 reintentos con backoff 1s/2s/4s) y `WikiSchemaChangedError` (selector de tabla roto). Ambos exportados desde `twi.item_catalog`.
  - `refresh_cache_from_wiki(..., enrich=False)`: si `enrich=True` recorre la página de cada ítem y enriquece `sprite_url`/`category`/`rarity`/`tooltip`. 404 por ítem → log + skip. 5xx por ítem → `WikiUnavailableError` (no escribe cache).
  - 5xx en la página de listado tampoco sobrescribe la cache existente (idempotencia ante fallo).
  - Cache schema bumped a **v2** (`{"schema": 2, "version": 2, "items": [...]}`); loader sigue aceptando schema 1 (retrocompatible).
  - Seed bundled versionado: `data/items_seed.v2.json` (5 ítems demo). `refresh.py` por defecto escribe en este fichero versionado y sale con código 1 si la wiki no responde, dejando el seed previo intacto.
  - 8 tests nuevos T-23..T-30 (mock `_RoutedClient`, sin red real).
- **Cambios iter-028**:
  - `search(query)` ahora distingue query vacía, búsqueda exacta por `item_id` positivo y búsqueda por nombre normalizado.
  - Se añadió soporte para IDs con ceros a la izquierda (`"0001"` -> `id=1`).
  - Enteros negativos, overflow de la rama de id y queries mixtas alfanuméricas caen a búsqueda por nombre.
  - El índice `dict[int, ItemDetail]` queda documentado como índice precomputado para `get` y búsqueda exacta por id.
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
  - Seed debe regenerarse (`python -m twi.item_catalog.refresh [--enrich]`) si la wiki añade nuevos ítems o cambian sprites.
  - Cerrado 2026-05-19: `app.py` (B6) carga por defecto `items_seed.v2.json`.
