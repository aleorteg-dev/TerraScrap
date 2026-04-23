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

def create_catalog_from_cache(cache_path: Path) -> ItemCatalog: ...
async def refresh_cache_from_wiki(cache_path: Path, client: HttpClient) -> None: ...
```

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

## 6. Plan de tests (TDD)
- [ ] `T-01 test_search_prefix_match_returns_item`
- [ ] `T-02 test_search_is_case_insensitive`
- [ ] `T-03 test_search_respects_limit`
- [ ] `T-04 test_search_orders_prefix_before_substring`
- [ ] `T-05 test_get_returns_item_detail`
- [ ] `T-06 test_get_unknown_id_raises_ItemNotFoundError`
- [ ] `T-07 test_create_catalog_from_cache_invalid_schema_raises`
- [ ] `T-08 test_refresh_cache_writes_versioned_json` (mockear `HttpClient`)
- [ ] `T-09 test_refresh_cache_parses_sample_wiki_html_page` (fixture HTML local)

## 7. Notas de implementación
- La lista de ítems de Terraria es finita (~5000). Se carga entera en memoria.
- Índices: `dict[int, ItemDetail]` por id, `list[tuple[str_normalizado, ItemSummary]]` para búsqueda.
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
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —