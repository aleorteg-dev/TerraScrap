# TerraScrap — Documento principal

> **Regla de oro para vibe coding**
> En cada iteración, la IA debe leer **únicamente**:
> 1. Este fichero (`PROJECT.md`) — contexto global, contratos y convenciones.
> 2. El fichero del módulo que se va a crear o modificar (`docs/modules/**/*.md`).
> 3. Si el cambio toca la API pública, también `docs/contracts/api-contract.md`.
>
> **No debe abrir otros módulos** salvo para leer su contrato público documentado aquí.
> Si un cambio requiere tocar más de un módulo, se parte en iteraciones: una por módulo.

---

## 1. Visión del producto

Aplicación web que permite a un jugador de Terraria:

1. Subir un fichero `.wld` local.
2. Ver el mundo completo **revelado** (sin niebla de guerra) en un canvas navegable (pan + zoom).
3. Buscar cualquier ítem del juego por nombre o ID.
4. Ver resaltados de forma **muy visible** todos los tiles del mundo donde aparezca ese ítem, ya sea:
   - como bloque/pared colocado,
   - como objeto del mundo (ej. una estatua, una planta),
   - **dentro de un contenedor** (cofres, cofres-hada, dressers, barriles).

Casos de uso principales:
- *"¿Dónde está la Zenith en este mundo?"* → resaltar el cofre que la contiene.
- *"¿Dónde hay Chlorophyte ore?"* → resaltar todos los tiles.
- *"¿Dónde dejé la Aglet?"* → rastrear en cofres.

---

## 2. Alcance (v1)

### 2.1. Requisitos funcionales
- **RF-01** Upload de un fichero `.wld` (máx. 200 MB). Validación de cabecera.
- **RF-02** Parseo completo del `.wld` a un modelo de dominio en memoria.
- **RF-03** Renderizado del mundo en canvas 2D, tiles revelados.
- **RF-04** Pan (drag) y zoom (rueda / pinch) sobre el canvas.
- **RF-05** Catálogo de ítems con autocompletado (nombre + id).
- **RF-06** Búsqueda del ítem sobre el mundo cargado:
  - Detecta tiles cuyo `tile_id`/`wall_id` coincide con el ítem si procede.
  - Detecta cofres/contenedores que contienen ese ítem en su inventario.
  - Devuelve coordenadas `(x, y)` de cada coincidencia + metadatos.
- **RF-07** Resaltado llamativo de las coincidencias sobre el canvas (halo animado, pulsación, marcador distinguible).
- **RF-08** Panel lateral con lista de coincidencias y botón "centrar" por cada una.

### 2.2. Requisitos no funcionales
- **RNF-01** Parsing de un mundo "Large" < 10 s en hardware medio.
- **RNF-02** Render inicial del mundo < 3 s tras parseo.
- **RNF-03** Búsqueda sobre el mundo cargado < 500 ms.
- **RNF-04** Todo el flujo funciona sin base de datos, en memoria de proceso / sesión.
- **RNF-05** Despliegue reproducible con `docker compose up`.

### 2.3. Fuera de alcance (v1)
- Edición o modificación de mundos.
- Autenticación y multi-usuario.
- Persistencia de mundos entre sesiones.
- Comparación entre dos mundos.
- Soporte móvil optimizado (se permite funcionar, no optimizar).

---

## 3. Stack tecnológico

| Capa | Tecnología | Motivo |
|------|------------|--------|
| Backend | Python 3.12 + FastAPI + uvicorn | Parseo binario cómodo (`struct`), DX rápida, OpenAPI nativo. |
| Tests backend | pytest + pytest-asyncio + hypothesis (opcional) | TDD idiomático en Python. |
| Lint/type backend | ruff + mypy (strict) | Calidad sin negociación. |
| Catálogo de ítems | Terraria Wiki (wiki.gg) vía scraping + caché local | Fuente rica y mantenida. |
| Frontend | React 19 + TypeScript + Vite | Ecosistema y tipado compartidos. |
| Render | Canvas 2D API nativa | Suficiente para tiles; sin dependencia 3D. |
| Tests frontend | Vitest + React Testing Library | TDD rápido en Vite. |
| HTTP | fetch nativo + tipos generados desde OpenAPI | Cliente tipado sin runtime pesado. |
| Contenedores | Docker + docker-compose | Una orden para levantar todo. |
| Reverse proxy | nginx (sirve front + proxea `/api`) | Estándar, simple. |

---

## 4. Arquitectura modular

```
                         ┌──────────────────────────────┐
                         │          Frontend             │
                         │  (React + TS + Canvas 2D)     │
                         └──────────────────────────────┘
                             │         │            │
                             ▼         ▼            ▼
                          ui-upload  world-canvas  search-panel
                             │         │            │
                             └────► api-client ◄────┘
                                       │
                                       ▼ HTTP/JSON  (contrato OpenAPI)
                         ┌──────────────────────────────┐
                         │           Backend             │
                         │       (FastAPI + Python)       │
                         └──────────────────────────────┘
                               │           │         │
                               ▼           ▼         ▼
                           api-rest   tile-search  item-catalog
                               │           │
                               ▼           ▼
                         world-repository  wld-parser
```

**Principios:**
- Dependencias **unidireccionales**. Ningún módulo de capa inferior importa de una superior.
- Cada módulo expone un **contrato público** (funciones / clases / DTOs) documentado en su `.md`. El resto del código solo puede depender del contrato, nunca de lo interno.
- La frontera backend/frontend es exclusivamente la API REST documentada en `docs/contracts/api-contract.md`.

### 4.1. Índice de módulos

| Id | Módulo | Tipo | Depende de | Documento |
|----|--------|------|------------|-----------|
| B1 | `wld-parser` | backend | — | `docs/modules/backend/wld-parser.md` |
| B2 | `world-repository` | backend | B1 | `docs/modules/backend/world-repository.md` |
| B3 | `item-catalog` | backend | — | `docs/modules/backend/item-catalog.md` |
| B4 | `tile-search` | backend | B1 (tipos), B2 | `docs/modules/backend/tile-search.md` |
| B5 | `api-rest` | backend | B2, B3, B4 | `docs/modules/backend/api-rest.md` |
| B6 | `app-bootstrap` | backend | B5 | `docs/modules/backend/app-bootstrap.md` |
| F1 | `api-client` | frontend | contrato API | `docs/modules/frontend/api-client.md` |
| F2 | `ui-upload` | frontend | F1 | `docs/modules/frontend/ui-upload.md` |
| F3 | `world-canvas` | frontend | F1 (tipos) | `docs/modules/frontend/world-canvas.md` |
| F4 | `search-panel` | frontend | F1 | `docs/modules/frontend/search-panel.md` |
| F5 | `highlight-overlay` | frontend | F3 | `docs/modules/frontend/highlight-overlay.md` |
| F6 | `app-shell` | frontend | F1..F5 | `docs/modules/frontend/app-shell.md` |
| P1 | `deployment-docker` | plataforma | todos | `docs/modules/platform/deployment-docker.md` |

---

## 5. Metodología: Vibe Coding + SDD + TDD

### 5.1. Ciclo por iteración (1 módulo = 1 iteración)

1. **Seleccionar el módulo** a tocar.
2. **Cargar en el contexto de la IA solo:**
   - `PROJECT.md`
   - `docs/modules/<ruta>/<módulo>.md`
   - `docs/contracts/api-contract.md` *solo si la iteración toca la API pública*.
3. **SDD (Specification-Driven Development):** abrir la sección "Contrato" del módulo y dejarla acordada *antes* de escribir tests. Si cambia el contrato, actualizar el doc primero.
4. **TDD rojo:** escribir los tests listados en la sección "Plan de tests" del módulo. Deben fallar.
5. **TDD verde:** implementar lo mínimo para que pasen.
6. **TDD refactor:** limpiar, sin romper tests.
7. **Cerrar la iteración:** actualizar la sección "Estado" del módulo (progreso, decisiones tomadas, deuda técnica explícita).
8. **Nunca** tocar otro módulo en la misma iteración. Si aparece una necesidad en otro módulo, anotarla en la sección "Deuda / follow-ups" de *este* documento y parar.

### 5.2. Reglas de acoplamiento
- Un módulo **no** accede a estado interno de otro; solo a su contrato.
- Cambios de contrato son un **evento de primera clase**: se actualiza el doc del módulo afectado *y* se lista en el changelog de abajo.
- Tests unitarios: aislados por módulo con mocks de dependencias.
- Tests de integración: viven en carpeta separada y pueden cruzar módulos; pero no entran en el ciclo TDD de un módulo aislado.

### 5.3. Prompt base para la IA (plantilla)
> Estoy iterando sobre el módulo **`<id> – <nombre>`** del proyecto TerraScrap.
> Contexto cargado: `PROJECT.md` y `docs/modules/<ruta>/<módulo>.md`.
> Objetivo de esta iteración: **`<frase corta>`**.
> Aplica el ciclo SDD → TDD (rojo → verde → refactor). No modifiques ningún otro módulo. Si detectas un cambio necesario en otro módulo, anótalo en la sección "Deuda / follow-ups" del doc del módulo actual y detente.

---

## 6. Estructura de carpetas

```
TerraScrap/
├── PROJECT.md
├── docs/
│   ├── MODULE_TEMPLATE.md
│   ├── contracts/
│   │   └── api-contract.md
│   └── modules/
│       ├── backend/
│       │   ├── wld-parser.md
│       │   ├── world-repository.md
│       │   ├── item-catalog.md
│       │   ├── tile-search.md
│       │   ├── api-rest.md
│       │   └── app-bootstrap.md
│       ├── frontend/
│       │   ├── api-client.md
│       │   ├── ui-upload.md
│       │   ├── world-canvas.md
│       │   ├── search-panel.md
│       │   ├── highlight-overlay.md
│       │   └── app-shell.md
│       └── platform/
│           └── deployment-docker.md
├── backend/
│   ├── pyproject.toml
│   ├── src/twi/
│   │   ├── wld_parser/
│   │   ├── world_repository/
│   │   ├── item_catalog/
│   │   ├── tile_search/
│   │   ├── api_rest/
│   │   └── app.py
│   └── tests/
│       ├── unit/
│       └── integration/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── api-client/
│   │   ├── ui-upload/
│   │   ├── world-canvas/
│   │   ├── search-panel/
│   │   ├── highlight-overlay/
│   │   └── app-shell/
│   └── tests/
└── docker/
    ├── backend.Dockerfile
    ├── frontend.Dockerfile
    ├── nginx.conf
    └── docker-compose.yml
```

---

## 7. Convenciones de código

### 7.1. Backend (Python)
- `ruff` + `ruff format` como único formateador/linter.
- `mypy --strict` obligatorio.
- Módulos de dominio puros (sin imports de FastAPI). FastAPI solo vive en `api_rest` y `app.py`.
- DTOs: `pydantic` v2. Diferenciar `Domain*` (dataclass) de `*Dto` (pydantic).
- Excepciones de dominio tipadas (`WldParseError`, `ItemNotFound`, etc.).

### 7.2. Frontend (TypeScript)
- `eslint` + `prettier`.
- `tsconfig` con `strict: true`, `noUncheckedIndexedAccess: true`.
- Carpetas por módulo, cada una expone `index.ts` con su contrato.
- Tipos de la API generados desde OpenAPI (`openapi-typescript`).
- Estado global mínimo; preferir props drilling corto o `useContext` solo dentro de `app-shell`.

### 7.3. Tests
- Nombres: `test_<sujeto>_<comportamiento>` (backend) / `<sujeto> should <comportamiento>` (frontend).
- Cada test debe describir una sola propiedad.
- Fixtures de `.wld` mínimos en `backend/tests/fixtures/` (crear sintéticos, no usar un mundo real de GB).

---

## 8. Definición de "done" por módulo
Un módulo se considera cerrado cuando:
1. Todos los tests de la sección "Plan de tests" del doc pasan.
2. `mypy`/`tsc` y el linter pasan sin warnings.
3. La sección "Contrato" del doc está al día con lo implementado.
4. La sección "Estado" del doc refleja la fecha de cierre y la versión.
5. No rompe los tests de integración de los módulos que dependen de él.

---

## 9. Orden de construcción recomendado (MVP)

1. **B3 `item-catalog`** (aislado, sin dependencias) → desbloquea búsqueda y frontend.
2. **B1 `wld-parser`** (aislado) → desbloquea todo lo demás del backend.
3. **B2 `world-repository`** → permite exponer el mundo por sesión.
4. **B4 `tile-search`** → lógica central de valor.
5. **B5 `api-rest`** + **B6 `app-bootstrap`** → API navegable.
6. **F1 `api-client`** (tipos desde OpenAPI) → contrato congelado en el front.
7. **F2 `ui-upload`** → primer flujo end-to-end (upload → respuesta).
8. **F3 `world-canvas`** → render del mundo.
9. **F4 `search-panel`** + **F5 `highlight-overlay`** → valor visible del producto.
10. **F6 `app-shell`** → pegamento, routing, layout.
11. **P1 `deployment-docker`** → empaquetar.

Se puede paralelizar F1–F3 con B4–B5 una vez fijado el contrato API.

---

## 10. Contrato de API (resumen)

El detalle vive en `docs/contracts/api-contract.md`. Resumen:

- `POST /api/worlds` → sube un `.wld` (multipart). Devuelve `world_id` (sesión) + metadatos + thumbnail base64 opcional.
- `GET /api/worlds/{world_id}` → metadatos del mundo cargado.
- `GET /api/worlds/{world_id}/tiles` → matriz de tiles paginada/empaquetada para el canvas.
- `GET /api/items?q=<query>` → autocompletado de ítems.
- `GET /api/worlds/{world_id}/search?item_id=<id>` → coincidencias `[{x, y, source: "block"|"wall"|"chest", chest_id?}]`.
- `DELETE /api/worlds/{world_id}` → libera memoria de la sesión.

---

## 11. Riesgos y decisiones abiertas

- **Formato `.wld`** varía por versión del juego. La v1 soportará un rango acotado (a fijar en `wld-parser`). Mundos fuera de rango → error explícito.
- **Scraping de la wiki** puede romperse. Mitigación: caché local JSON versionado, que puede embeberse como fallback.
- **Tamaño del payload de tiles**. Puede exigir codificación binaria o tiling por chunks. Decisión aplazada al módulo `api-rest` / `world-canvas`.
- **Licencia de sprites**. Si se sirven imágenes, revisar términos de la wiki. Alternativa: solo nombres y rectángulo de resaltado.

### 11.1. Brecha funcional frente a TerraMap

Referencia local revisada: `C:\Users\aleja\Desktop\Alejandro\Universidad\DRA\terramap.github.io`.

Brechas planificadas (iteraciones B1.1..F6.2). Cada bullet se materializa en una iteración SDD/TDD aislada por módulo, con cambio de contrato documentado:

- **Frames de tile**: `frame_x/frame_y` en `Tile` para distinguir variantes (muebles, statues, frame-important).
- **Tipo de líquido**: `liquid_type ∈ {water, lava, honey, shimmer}` en `Tile`, no solo cantidad.
- **NPCs**: parser de sección NPCs en B1, endpoint `GET /worlds/{id}/npcs` en B5, panel NPCs en F6.
- **Tile entities**: item frames, weapon racks, mannequins, hat racks, plates con sus inventarios; visibles desde B4 search como `source="object"`.
- **Encoding `/tiles` enriquecido**: `base64-rle-v2` (8 bytes/tile: tile_id, wall_id, liquid_type+amount, frame_x, frame_y, flags) en B5/F3.
- **Render por capas**: paredes, líquidos y bandas cielo/superficie/roca/infierno con paleta completa estilo TerraMap en F3.
- **Selección visual + panel tile-info**: marcador del tile seleccionado en F5 y panel de detalle del tile en F6 alimentado por endpoint de inspección.
- **Zoom-to-fit**: `WorldCanvasHandle.zoomToFit()` en F3 + control global en F6.
- **Export PNG**: composición canvas base + overlay desde F6.
- **Highlight `style="mask"` + panel propiedades del mundo**: F5 admite modo mask (oscurece mapa, pinta matches claros) y F6 muestra panel con metadata enriquecida (`spawn_x/y`, `world_surface_y`, `rock_layer_y`, `hell_layer_y`).

No se aborda como refactor transversal. Una brecha → una iteración. El orden recomendado sigue las dependencias: B1 dominio → B5/F1 API → B4 búsqueda → F3 render → F4/F5/F6 UI.

Estado: planificado, no implementado.

---

## 12. Glosario

- **Tile**: celda del mundo. Contiene `tile_id` (bloque), `wall_id` (pared), flags (liquido, cable, etc.).
- **Chest / Contenedor**: estructura aparte del grid con inventario de hasta 40 ítems.
- **World reveal**: render sin niebla de guerra, como si el jugador hubiese explorado todo.
- **Match source**: origen por el que un ítem aparece en un tile: `block`, `wall`, `chest`, `object`.

---

## 13. Changelog de contratos
Cada cambio de contrato (API o módulo) se añade aquí.

| Fecha | Módulo | Cambio | PR/Iter |
|-------|--------|--------|---------|
| 2026-04-23 | — | Documento inicial. | iter-000 |
| 2026-04-23 | B3 item-catalog | Contrato v1: `ItemCatalog`, `ItemSummary`, `ItemDetail`, `ItemNotFoundError`, `create_catalog_from_cache`, `refresh_cache_from_wiki`. | iter-001 |
| 2026-04-24 | B1 wld-parser | Contrato v1: añadido `Sign`, `TileGrid`, códigos de error en `WldParseError`. Implementación completa del parser v230-v279. | iter-002 |
| 2026-04-26 | B2 world-repository | Contrato v1: `WorldRepository` (Protocol), `WorldNotFoundError`, `create_in_memory_repository`. Implementación in-memory thread-safe con TTL y clock inyectado. | iter-003 |
| 2026-04-26 | B4 tile-search | Contrato v1: `SearchMatch`, `SearchResult`, `TileSearchEngine` (Protocol), `create_tile_search_engine`. Wall search por comparación directa. Budget perf test 3.5 s (numpy pendiente). | iter-004 |
| 2026-04-26 | B5 api-rest | Contrato v0.1.0: `create_router`, DTOs pydantic v2 (`WorldCreatedDto`, `WorldMetadataDto`, `TilesChunkDto`, `SearchResultDto`, `SearchMatchDto`, `ItemSummaryDto`, `ItemDetailDto`, `ErrorDto`). 7 endpoints REST, header `X-API-Version`, encoding base64-rle-v1. | iter-005 |
| 2026-04-26 | B6 app-bootstrap | Contrato v0.1.0: `create_app(settings?)→FastAPI`, `Settings(BaseSettings)` con prefijo `TWI_` (6 campos + `purge_interval_seconds`). CORS, middleware de tamaño, lifespan con task de purga, `/healthz`, `_NullCatalog` como fallback. | iter-006 |
| 2026-04-26 | F1 api-client | Contrato v0.1.0: `ApiClient` interface, `ApiError`, `createApiClient`. Tipos generados desde `docs/contracts/openapi.json` con `openapi-typescript`. Script `npm run gen:api`. 9 tests (T-01…T-08 + T-07b). | iter-007 |
| 2026-04-26 | F3 world-canvas | Contrato v1: `WorldCanvas` (FC), `WorldCanvasHandle` (centerOn, setZoom, redraw, screenToWorld, worldToScreen), `WorldCanvasProps`. Decoder `base64-rle-v1`, viewport puro, pan/drag, zoom/rueda, ResizeObserver. Tipos provisionales (F1 pendiente). 18 tests unitarios + 5 componente, 27 total. | iter-008 |
| 2026-04-27 | F2 ui-upload | Contrato v1: `UploadWorld` (FC), `UploadProps`, `UploadResult`. Dropzone + input `.sr-only`, drag & drop, validación cliente (extensión + tamaño), estados idle/uploading/success/error, `apiClient` inyectable. 8 tests (T-01…T-08). | iter-009 |
| 2026-04-27 | F4 search-panel | Contrato v1: `SearchPanel` (FC), `SearchPanelProps`. Combobox ARIA, debounce 200 ms, checkbox `include_containers`, lista de matches con botón "Centrar", callback `onMatchFocus`, `onResults(null)` al limpiar. 9 tests (T-01…T-09). | iter-010 |
| 2026-04-27 | F5 highlight-overlay | Contrato v1: `HighlightOverlay` (FC), `HighlightOverlayProps`. Canvas absolutamente posicionado, `pointer-events:none`, loop rAF, halo pulsante por source (pulse/outline/ping), degradación automática a outline >500 matches. Zoom derivado de `worldToScreen`. 7 tests (T-01…T-07). | iter-011 |
| 2026-04-27 | F6 app-shell | Contrato v1: `App` (FC), `AppProps`. `useReducer` NoWorld/WorldLoaded, sessionStorage recovery, toast en error de API, cableado F2→F3→F4→F5, ErrorBoundary. 7 tests (T-01…T-07). | iter-012 |
| 2026-04-27 | P1 deployment-docker | Contrato v0.1.0: `docker/backend.Dockerfile` (multi-stage, python:3.12-slim, user twi), `docker/frontend.Dockerfile` (node:20-alpine + nginx:1.27-alpine, gen:api), `docker/nginx.conf` (/healthz proxy añadido), `docker/docker-compose.yml` (context:.., items-cache volume, env defaults), `.dockerignore`, `docker/smoke.sh`, `.env.example`. T-01..T-03 pasan. T-04 (trivy) diferido a CI. | iter-013 |
| 2026-04-27 | B3 item-catalog | Contrato v1.1: añadidos `ItemCatalogUnavailableError`, `load_catalog(cache, seed)`. Seed bundled en `item_catalog/data/items.seed.json` (schema v1). B6 `app.py`: `Settings.item_seed_path`, `load_catalog` en startup. T-10..T-14 + IT-01..IT-02. Fix: volumen `items-cache` vacío en primer arranque ya no deja catálogo vacío. | iter-014 |
| 2026-04-28 | B3 item-catalog | Scraper fix: tabla wiki cambió de `wikitable` a `terraria lined sortable`; `_find_items_table` con detección tolerante. Seed reemplazado: 12 → 6146 ítems. Añadido `refresh.py` (`python -m twi.item_catalog.refresh`). Fixture + T-09 actualizados. Sin cambio de contrato público. | iter-018 |
| 2026-04-28 | Plan TerraMap parity | Documentada brecha funcional frente a TerraMap y orden recomendado de iteraciones: B1 dominio, B5/F1 API, B4 búsqueda, F3 render, F4/F5/F6 UI. Sin cambio de código ni contrato vigente. | planning |
| 2026-04-28 | Doc TerraMap parity SDD | Formalizada §11.1 (10 brechas en bullets), §4 api-contract (`WorldMetadataDto` extendido, `base64-rle-v2` 8 bytes/tile, `GET /tile`, `GET /npcs`, `frame_x/frame_y` en `/search`) y secciones "Evolución propuesta" en B1, B4, B5, F1, F3, F4, F5, F6. Cero cambios de código. Cada sección marcada `Estado: planificado, no implementado`. | iter-DOC-0 |
| 2026-04-28 | B1 wld-parser | Contrato v2.0 (breaking): `Tile.liquid: int` reemplazado por `liquid_type: Literal["none","water","lava","honey","shimmer"]` + `liquid_amount: int`. Shimmer = `liquid_bits==1` AND `flags3 & 0x80`. Builder: `_encode_liquid_tile`, parámetro `liquid_at` en `build_world`. T-13..T-17 verdes. Deuda: `base64-rle-v2` pendiente de iter API.1. | iter-020 |
| 2026-04-28 | B1 wld-parser | Contrato v1.1: `Tile.frame_x: int \| None` y `Tile.frame_y: int \| None` (default `None`). Se pueblan cuando `tfi[tile_id]==True`; en tiles unframed/aire quedan `None`. Tile 144 (Timers) fuerza `frame_y=0` replicando `WorldFile.LoadTiles`. Builder fixture: `tile_frame_at` y `frame_important_ids`. T-09..T-12 verdes. Defaults preservan retrocompatibilidad de `Tile(...)` en B2/B4/B5. | iter-019 |
| 2026-04-30 | B1 wld-parser | Contrato v2.1: Via B para mundos v319. Se mantiene soporte v230-v279 y se mejora `UnsupportedWorldVersionError`/`WldParseError` con `details`, `detected_version` y `supported_range`. Fixture sintetica `build_world(version=319)`. Soporte real v319 queda como deuda explicita. | iter-021 |
| 2026-04-30 | B5 api-rest | Via A: frontera cliente-servidor realineada a `base64-rle-v1` porque es el canon vigente de `CLAUDE.md` y `api-contract.md`; `base64-rle-v2` queda solo como propuesta `v0.2.0`. Regenerados `docs/contracts/openapi.json` y tipos con `npx.cmd openapi-typescript ..\docs\contracts\openapi.json -o src\api-client\__generated__\schema.d.ts`. | iter-022 |
| 2026-05-01 | B4 tile-search | Fix tipado: eliminada redefinición de `tile_map` y `wall_map` en `create_tile_search_engine`. Sin cambio de contrato público. | iter-023 |
| 2026-05-01 | F3 world-canvas | Fix P1 render: chunks parciales en bordes derecho/inferior usan `computeChunkDimensions`; bitmaps y `drawImage` se recortan a dimensiones reales. Sin cambio de contrato publico. | iter-024 |
| 2026-05-01 | F4 search-panel | Fix P1 UX/contrato: la UI envía `include_containers=true` por defecto y documenta el checkbox "Incluir contenedores" para excluir cofres/contenedores durante la sesión del componente. | iter-025 |
| 2026-05-01 | housekeeping frontend | housekeeping: frontend lint formato Prettier auto-fix sobre 8 archivos. | iter-housekeeping-P2 |
| 2026-05-01 | docs | docs: alineación de stack a React 19 en PROJECT.md, README.md, CLAUDE.md. | iter-docs-P2 |
| 2026-05-01 | housekeeping backend | housekeeping: eliminados 4 directorios pytest temporales en backend/ y añadidas reglas específicas/genéricas en .gitignore para prevenir variantes Codex pytest tmp. | iter-housekeeping-P2 |
| 2026-05-02 | B5 api-rest | Contrato de errores HTTP unificado: 413 canonico `upload_too_large`, 422 `validation_error` con `ErrorDto`, fallback `http_error`, 500 `internal_error` sin trazas y `X-API-Version` obligatorio tambien en errores. Regenerado `docs/contracts/openapi.json`; tipos frontend no tocados. | iter-027 |
| 2026-05-05 | B3 item-catalog | Contrato v1.2: `search(q)` añade búsqueda exacta por `item_id` cuando `q` parsea como entero positivo, conserva búsqueda por nombre normalizado para texto, negativos/overflow/mixto alfanumérico, y devuelve `[]` para query vacía. API `/api/items?q=` mantiene firma y forma de respuesta. | iter-028 |
| 2026-05-06 | B2 world-repository | Contrato v1.1: `delete_strict(world_id)` añadido al Protocol y a `_InMemoryRepository`; lanza `WorldNotFoundError` si id ausente o expirado. Tests T-09, T-09b, T-09c. | iter-032 |
| 2026-05-06 | B5 api-rest | Contrato v0.1.1: `DELETE /api/worlds/{id}` usa `delete_strict` (elimina antipatrón `get()+delete()`). `GET /api/items` y `GET /api/items/{id}` devuelven 503 `code:"catalog_unavailable"` cuando catálogo no disponible. Tests T-27, T-28. Regenerado `docs/contracts/openapi.json`. | iter-032 |
| 2026-05-06 | B6 app-bootstrap | Contrato v0.1.1: `_NullCatalog.search()` y `_NullCatalog.get()` lanzan `ItemCatalogUnavailableError` en lugar de devolver `[]` / lanzar `ItemNotFoundError`. Habilita el 503 de B5. | iter-032 |
| 2026-05-06 | F1 api-client | Contrato v0.1.1: `getItem(itemId: number): Promise<ItemDetail>` añadido a `ApiClient` interface e implementación. Tipos regenerados desde `openapi.json` actualizado. | iter-032 |
| 2026-05-06 | F2 ui-upload | ID estático `"wld-file-input"` migrado a `useId()` (React 18+). Seguro para múltiples instancias. Sin cambio de contrato público. | iter-032 |
| 2026-05-06 | api-contract | Contrato promovido a v0.2: `base64-rle-v2` (magic header "TWv2", 10 bytes/run, FRAME_BLOCK), `WorldMetadataDto` extendido (spawn_x/y, capas), endpoints `GET /tile` y `GET /npcs`, `NpcDto`/`TileDetailDto`/`SearchMatchDto` extendidos, `frame_x/frame_y` en `/search`, `X-API-Version: 0.2` obligatorio, DELETE estricto 204/404, 503 `catalog_unavailable`. Solo docs. Implementación en iter-011. | iter-01 |
| 2026-05-09 | B6 app-bootstrap | Contrato v0.1.2: nuevo módulo `twi/observability.py` con `JsonFormatter`, `configure_logging`, `RequestContextMiddleware` (`X-Request-Id` UUID v4, access log JSON con `request_id/method/path/status/duration_ms/error.code`). Loggers `twi.access` y `twi.purge`. Header transitorio `X-Error-Code` en `error_response` (B5) consumido por el middleware. Tests T-07..T-11. Cierra deuda SP-04 y la deuda app-level del 503 catalog_unavailable. | iter-07 |
| 2026-05-09 | B5 api-rest | Contrato v0.2 parcial: DTOs v0.2 (`WorldMetadataDto` extendido con `spawn_x/spawn_y/world_surface_y/rock_layer_y/hell_layer_y`; nuevos `NpcDto`, `NpcListDto`, `TileEntityDto`, `TileDetailDto`). `TilesChunkDto.encoding` pasa a `Literal["base64-rle-v1","base64-rle-v2"]`. Encoder `_encode_chunk_v2` (HEADER "TWv2" 8B + RUNS 10B + FRAME_BLOCK 6B). `GET /tiles?encoding=v2` retorna v2; encoding desconocido → 400 `invalid_encoding`. Default sigue siendo v1. Snapshot OpenAPI/json frontend NO regenerados (iter-011). Endpoints `/tile` y `/npcs` pendientes (iter 09–10). | iter-08 |
| 2026-05-09 | B5 api-rest | Contrato v0.2 parcial (continuación): endpoint `GET /api/worlds/{world_id}/tile?x=&y=` devuelve `TileDetailDto` (`chest_id` desde `World.chests`, `sign_id` como índice en `World.signs`, `tile_entity_id` desde `World.tile_entities`). 400 `coordinates_out_of_bounds` si fuera de rango (diverge de `invalid_coordinates` por instrucción), 404 `world_not_found`. Tests T-29..T-32. OpenAPI snapshot pendiente iter-011. | iter-09 |
| 2026-05-09 | B5 api-rest | API v0.2 implementada: `DELETE /api/worlds/{id}` estricto via `delete_strict` (204/404), `GET /search` admite `frame_x` y `frame_y` para filtrar matches por frame exacto del tile, header `X-API-Version: 0.2` en toda respuesta (`errors.API_VERSION` promovido). `docs/contracts/openapi.json` y `backend/tests/unit/api_rest/openapi_snapshot.json` regenerados; `test_openapi_schema_snapshot` desmarcado y nuevo `test_contracts_openapi_json_matches_app_schema`. Cierra deuda v0.2 de B5. | iter-11 |
| 2026-05-10 | B4 tile-search | Schema JSON v2.0.0: root `{schema_version, items}`; cada item mapea a lista de matchers (alias). Soporte `wall_ids` (multi-wall) y `frame_xys` (multi-frame). `MappingStaleError` lanzada cuando `schema_version` falta o difiere. Engine: single-pass combinado para block+wall via set-lookup; perf 1M tiles ~70 ms (budget 500 ms). `create_tile_search_engine(world_map_path=...)` permite cargar JSON custom. Sin cambios en contrato publico (`SearchMatch.source` Literal congelado a `block|wall|chest|object` por contrato API v0.2). 33 tests, 89% cobertura. Cierra MULTI-WALL-ID, MULTI-FRAME-ITEM, OBJECT-ALIAS-01, STALE-JSON. | iter-12 |
| 2026-05-11 | F4 search-panel | Contrato v2.0 (breaking): `onMatchFocus(match, index)` añade índice en lista filtrada. Virtualización sin deps nuevas (`ROW_HEIGHT=40`, `OVERSCAN=10`). Navegación next/prev (`n`/`p`) + atajos `Escape`/`/` via `window.addEventListener`. Filtros client-side por `source` (multi-select). Autocompletado con generación-counter para ignorar respuestas obsoletas. A11y: `role="listbox"` + `aria-selected` en matches. 20 tests (T-01..T-17). | iter-18 |
| 2026-05-11 | F6 app-shell | Contrato v2.0: reducer extendido (`selectedTile/tileDetail/npcs/layers/maskMode/sidebarOpen/panels/zoom`). `AppContext` (no exportado) para sub-componentes. `Toolbar` (zoom+/−/reset, layer toggles, mask mode, export PNG). `NpcPanel` (carga lazy, click centra canvas). `TileDetailPanel` (muestra `TileDetailDto`, cierre limpia selección). Layout móvil: `data-open` en sidebar + CSS `@media max-width:767px`. `onMatchFocus` → centra canvas + selecciona tile + carga detail. 21 tests (T-01..T-07 + layout + 6 nuevos). | iter-19 |
| 2026-05-11 | P1 deployment-docker | **v0.2 — CIERRE GLOBAL** Contrato v0.2.0: `--legacy-peer-deps` documentado con justificación en Dockerfile. `docker/scan.sh` creado (trivy, CRITICAL bloquea, HIGH loguea, umbral configurable, graceful no-op si trivy ausente). `docker/smoke.sh` ampliado a T-01a..T-01j (items vacío, POST fixture, GET tiles, GET npcs, DELETE, 404 post-delete). `docker/smoke_world.wld` fixture 550 B (v269, 8×4). Bundle frontend: 73.82 kB gzipped (target <2 MB cumplido; code splitting innecesario). Backend: mypy OK, ruff OK, 203 tests, 90% cobertura. Frontend: ESLint+Prettier OK, 91.02% cobertura, build OK. Deuda abierta: DEUDA-P1-01 (legacy-peer-deps), DEUDA-P1-02 (trivy en CI). | iter-020 |

---

## 14. Estado global — v0.2 cerrada (2026-05-11)

Todos los módulos del orden de construcción B1→B6, F1→F6, P1 están implementados y cerrados.

| Módulo | Estado | Cobertura | Iter. cierre |
|--------|--------|-----------|--------------|
| B1 wld-parser | ✅ cerrado | ≥87% | iter-021 |
| B2 world-repository | ✅ cerrado | ≥96% | iter-032 |
| B3 item-catalog | ✅ cerrado | ≥90% | iter-018 |
| B4 tile-search | ✅ cerrado | 89% | iter-12 |
| B5 api-rest | ✅ cerrado | 97% | iter-11 |
| B6 app-bootstrap | ✅ cerrado | 92% | iter-07 |
| F1 api-client | ✅ cerrado | 79%* | iter-032 |
| F2 ui-upload | ✅ cerrado | 89% | iter-032 |
| F3 world-canvas | ✅ cerrado | 94% | iter-024 |
| F4 search-panel | ✅ cerrado | 94% | iter-18 |
| F5 highlight-overlay | ✅ cerrado | 91% | iter-011 |
| F6 app-shell | ✅ cerrado | 91% | iter-19 |
| P1 deployment-docker | ✅ cerrado | — | iter-020 |

*`api-client/errors.ts` 79% (1 punto bajo umbral 80%) — deuda DEUDA-F1-01 abierta.

**Deuda abierta al cierre v0.2:**
- DEUDA-P1-01: `--legacy-peer-deps` hasta openapi-typescript con soporte TypeScript 6.
- DEUDA-P1-02: trivy en CI pipeline (script listo, falta workflow).
- DEUDA-F1-01: `api-client/errors.ts` 79% cobertura (1pt bajo umbral).
- DEUDA-B5-01: `api_rest/errors.py` 68% cobertura (complex HTTP handler branches).
- DEUDA-B3-01: `item_catalog/refresh.py` 70% cobertura (CLI script, difícil aislar).
- DEUDA-B1-01: soporte real de mundos v319+ (actualmente rechazados con error explícito).

**Métricas finales:**
- Backend: `mypy --strict` ✅ | `ruff` ✅ | 203 unit tests | 90% cobertura total
- Frontend: ESLint+Prettier ✅ | `tsc` ✅ | 91.02% cobertura total | bundle 73.82 kB gzip
- API: OpenAPI v0.2, snapshot sincronizado (`openapi_snapshot.json`)
- Docker: smoke T-01a..T-01j | `scan.sh` listo | bundle <2 MB target cumplido
