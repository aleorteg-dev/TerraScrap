# CLAUDE.md — TerraScrap

Aplicación web para subir mundos de Terraria (`.wld`), explorarlos sin niebla de guerra en un canvas interactivo, y localizar ítems por nombre o ID con resaltado visual.

---
## Descubrimiento de skills (obligatorio en cada turno)

Antes de responder a cualquier petición del usuario, invoca **siempre primero** la skill `find-skills` para descubrir skills relevantes a la tarea solicitada. Si `find-skills` recomienda alguna, úsala en lugar de improvisar el flujo manualmente. Solo si no hay ninguna aplicable, continúa con el resto de instrucciones de este documento.

Esta regla aplica incluso a peticiones cortas o aparentemente triviales: el coste de una llamada a `find-skills` es bajo y evita reinventar capacidades ya empaquetadas.

---
## Regla de oro: trabaja un módulo por iteración

**Antes de escribir una sola línea de código**, lee:

1. `PROJECT.md` — contexto global, contratos, convenciones.
2. `docs/modules/<ruta>/<módulo>.md` — spec del módulo activo.
3. `docs/contracts/api-contract.md` — solo si la iteración toca la frontera cliente–servidor.

**No abras otros módulos.** Si un cambio requiere tocar otro módulo, anótalo en la sección "Deuda / follow-ups" del doc del módulo actual y detente. Un módulo por iteración, sin excepciones.

---

## Ciclo obligatorio por iteración (SDD → TDD)

```
1. Leer spec del módulo → acordar contrato (actualizar el doc si cambia algo).
2. Escribir tests en ROJO (todos deben fallar al empezar).
3. Implementar en VERDE (mínimo para pasar los tests).
4. Refactorizar (sin romper tests).
5. Actualizar sección "Estado" del doc del módulo.
```

Usa este prompt base al iniciar una iteración:

```
Estoy iterando sobre el módulo <id> – <nombre> del proyecto TerraScrap.
Contexto cargado: PROJECT.md y docs/modules/<ruta>/<módulo>.md.
Objetivo de esta iteración: <frase corta>.
Aplica el ciclo SDD → TDD (rojo → verde → refactor). No modifiques ningún
otro módulo. Si detectas un cambio necesario en otro módulo, anótalo en
"Deuda / follow-ups" del doc del módulo actual y detente.
```

---

## Orden de construcción

```
B1 wld-parser → B3 item-catalog → B2 world-repository → B4 tile-search
             → B5 api-rest → B6 app-bootstrap
F1 api-client → F2 ui-upload → F3 world-canvas → F4 search-panel
             → F5 highlight-overlay → F6 app-shell
P1 deployment-docker  (al final)
```

F1–F3 se puede paralelizar con B4–B5 una vez fijado el contrato API.

---

## Comandos de verificación

Ejecuta estos comandos antes de cerrar cualquier iteración. **No se cierra un módulo con warnings.**

### Backend

```bash
cd backend
pytest                                    # todos los tests del módulo activo
pytest tests/unit/<módulo>/               # solo el módulo activo
pytest --cov=twi --cov-report=term-missing  # cobertura (mínimo 80 % por módulo)
mypy src/twi --strict                     # tipado estricto, sin errores
ruff check src/ tests/                    # linting
ruff format src/ tests/ --check          # formato
```

### Frontend

```bash
cd frontend
npm test                                  # Vitest
npm run lint                              # ESLint + Prettier
npm run build                             # tsc + Vite (0 errores)
```

### Docker (integración completa)

```bash
docker compose -f docker/docker-compose.yml up --build
```

---

## Stack

| Capa | Tecnología |
|------|------------|
| Backend | Python 3.12, FastAPI, Uvicorn |
| Tests backend | pytest, pytest-asyncio, hypothesis (property-based) |
| Lint/tipo backend | ruff, mypy --strict |
| Frontend | React 19, TypeScript, Vite |
| Tests frontend | Vitest, React Testing Library |
| Lint frontend | ESLint, Prettier |
| Contenedores | Docker, docker-compose, nginx |

---

## Convenciones de código

### Python (backend)

- `mypy --strict` obligatorio. Sin `Any` explícito.
- `ruff` + `ruff format` como único linter/formateador.
- Módulos de dominio puros: sin imports de FastAPI. FastAPI solo en `api_rest/` y `app.py`.
- Modelos de dominio: `dataclass`. DTOs de API: `pydantic` v2 (sufijo `Dto`).
- Excepciones tipadas: `WldParseError`, `ItemNotFound`, `WorldNotFound`, etc.
- Cobertura mínima por módulo: **80 %**.

### TypeScript (frontend)

- `tsconfig` con `strict: true`, `noUncheckedIndexedAccess: true`. Cero `any`.
- Interfaces para estructuras de objeto; `type` solo para uniones y tuplas.
- Cada módulo expone su contrato en `index.ts`.
- Tipos de la API: **auto-generados** desde OpenAPI con `openapi-typescript` en `frontend/src/api-client/__generated__/`. No los edites a mano.
- Estado global mínimo: props o `useContext` solo dentro de `app-shell`.

### Tests

- Backend: `test_<sujeto>_<comportamiento>`.
- Frontend: `<sujeto> should <comportamiento>`.
- Fixtures `.wld` sintéticos en `backend/tests/fixtures/` (no mundos reales de GB).
- Tests unitarios: mockar dependencias de otros módulos.
- Tests de integración: carpeta separada, no forman parte del ciclo TDD de un módulo aislado.

---

## Riesgos críticos

### Parser `.wld` (B1)
- Soporta versiones **v230–v319** únicamente (fuente única:
  `MIN/MAX_SUPPORTED_VERSION` en `wld_parser/_constants.py`, IT-15).
- Cualquier mundo fuera de ese rango debe lanzar `WldParseError` con `code="unsupported_version"`.
- No intentes inferir el formato de versiones desconocidas.

### Catálogo de ítems (B3)
- Fuente primaria: scraping de `wiki.gg`.
- **Fallback obligatorio**: caché JSON local versionada. Si el scraping falla, usar la caché; nunca romper el arranque.
- Si regeneras la caché, versiona el fichero.

### Encoding de tiles (B5 / F3)
- Contrato vigente v0.2: los tiles viajan como `base64-rle-v1` (default) o `base64-rle-v2`
  (negociado vía query param `?encoding=` en `GET /tiles`). Spec exacto en
  `docs/contracts/api-contract.md` §5.2 y en `world-canvas.md`.
- No inventes otro encoding; cambios aquí afectan al contrato API.

### Sesiones en memoria
- Sin base de datos, sin persistencia entre reinicios.
- TTL de sesión: **30 minutos** desde el último acceso (configurable con `TWI_WORLD_TTL_SECONDS`).
- `world_id` es un UUID v4 opaco; quien lo tenga puede operar sobre ese mundo.

---

## Contratos de API (resumen rápido)

El detalle completo vive en `docs/contracts/api-contract.md`. Al tocar la frontera cliente–servidor, lee ese fichero completo.

| Endpoint | Descripción |
|----------|-------------|
| `POST /api/worlds` | Sube `.wld`; devuelve `world_id` + metadatos |
| `POST /api/world-imports` | Sube `.wld` como import job asíncrono; devuelve `job_id` (202) |
| `GET /api/world-imports/{job_id}` | Estado/progreso del import job (polling) |
| `GET /api/worlds/{world_id}` | Metadatos del mundo en sesión |
| `DELETE /api/worlds/{world_id}` | Libera memoria |
| `GET /api/worlds/{world_id}/tiles` | Tiles empaquetados por chunk (`base64-rle-v1`) |
| `GET /api/worlds/{world_id}/search?item_id=` | Coincidencias `{x, y, source, chest_id?}` |
| `GET /api/items?q=` | Autocompletado del catálogo |
| `GET /api/items/{item_id}` | Detalle de un ítem |

Errores siempre con forma: `{ "error": { "code": string, "message": string, "details"?: any } }`.

---

## Definición de "done" para un módulo

Un módulo está cerrado cuando:

- [ ] Todos los tests de la sección "Plan de tests" del doc pasan.
- [ ] `mypy --strict` / `tsc` pasan sin errores.
- [ ] Linter (ruff / ESLint) pasa sin warnings.
- [ ] Sección "Contrato" del doc está al día con lo implementado.
- [ ] Sección "Estado" del doc tiene fecha de cierre.
- [ ] No rompe los tests de integración de módulos dependientes.

---

## Acoplamiento: lo que nunca debes hacer

- Importar un módulo de capa superior desde uno de capa inferior.
- Acceder a estado interno de otro módulo (solo su contrato público).
- Cambiar el contrato de un módulo sin actualizar su doc y el changelog de `PROJECT.md`.
- Tocar más de un módulo en la misma iteración.
- Editar `frontend/src/api-client/__generated__/` a mano.
