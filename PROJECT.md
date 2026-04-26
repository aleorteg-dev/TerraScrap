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
| Frontend | React 18 + TypeScript + Vite | Ecosistema y tipado compartidos. |
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