# PLAN_REMEDIACION.md — TerraScrap

> **Origen**: auditoría estática completa del 2026-07-15 (backend + frontend + docker + docs)
> más línea base ejecutada en local (pytest, mypy, ruff, ESLint/Prettier, Vitest, build).
> **Objetivo**: cerrar TODOS los hallazgos de la auditoría siguiendo la metodología del
> proyecto: **SDD → TDD, un módulo por iteración, sin excepciones** (ver `CLAUDE.md`).
>
> Cada hallazgo tiene un ID (`E##` error, `P##` rendimiento, `M##` código muerto,
> `D##` duplicación, `G##` gobernanza/docs, `N##` nuevo de la línea base). La tabla de
> trazabilidad del §6 garantiza que ninguno queda sin iteración asignada.

---

## 0. Estado del entorno local (ejecutado el 2026-07-15)

Herramientas instaladas en este equipo como parte de la puesta a punto (sin permisos de
administrador, ámbito usuario):

| Herramienta | Versión | Ubicación |
|---|---|---|
| Python | 3.12.10 (winget, scope user) | `%LOCALAPPDATA%\Programs\Python\Python312\` |
| Node.js | v24.18.0 LTS "Krypton" (zip portable) | `%LOCALAPPDATA%\Programs\nodejs\` |
| venv backend | creado con deps `[dev]` | `backend\.venv\` |
| node_modules | `npm ci` (328 paquetes) | `frontend\node_modules\` |
| Tipos OpenAPI | regenerados con `npm run gen:api` | `frontend\src\api-client\__generated__\schema.d.ts` |

Ambas rutas quedaron **prepending** en el PATH de usuario (nuevas terminales ya ven
`python`, `node` y `npm`; el alias stub de la Microsoft Store queda por detrás).

**Ajuste local aplicado (solo entorno, no toca el repo):** el checkout tenía CRLF
(`core.autocrlf=true` global y el repo no tiene `.gitattributes`), lo que hacía fallar
`prettier --check` en TODOS los ficheros. Se configuró `git config core.autocrlf input`
(local del repo) y se renormalizó el working tree a LF (`git rm -r --cached . && git reset
--hard`). El contenido de los ficheros es idéntico; solo cambian los finales de línea en
disco. El arreglo permanente del repo es IT-00B.

**Pendiente de decisión del usuario:** Docker Desktop no se instaló (requiere elevación
UAC, WSL2 y posiblemente reinicio). Sin él, la verificación P1 (`docker compose up
--build`, `smoke.sh`) solo corre en CI. Si se quiere en local:
`winget install -e --id Docker.DockerDesktop` desde una terminal de administrador.

### Línea base medida (2026-07-15)

| Suite | Resultado |
|---|---|
| `pytest` backend | **1 failed, 284 passed, 4 skipped** — falla `test_create_app_returns_fastapi_with_routes_mounted` (→ N01) |
| `mypy src/twi --strict` | ✅ sin errores (22 ficheros) |
| `ruff check` / `ruff format --check` | ✅ / ✅ (45 ficheros) |
| `npm run lint` | ✅ (tras renormalizar EOL; antes fallaba Prettier en todo → N02) |
| `npm test` | ✅ 236 tests, 13 ficheros |
| `npm run build` | ✅ — bundle `index.js` 292.78 kB (94.07 kB gzip) → N04: PROJECT.md dice 72 kB |

Comandos de verificación en este equipo (idénticos a `CLAUDE.md`, con rutas locales):

```powershell
# Backend
cd C:\Users\aleja\Desktop\TerraScrap\backend
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m mypy src/twi --strict
.\.venv\Scripts\python.exe -m ruff check src tests
.\.venv\Scripts\python.exe -m ruff format src tests --check

# Frontend (nueva terminal ya tiene node en PATH)
cd C:\Users\aleja\Desktop\TerraScrap\frontend
npm run lint ; npm test ; npm run build
```

---

## 1. Reglas de ejecución del plan

1. **Una iteración = un módulo.** Si al implementar aparece la necesidad de tocar otro
   módulo, se anota en "Deuda / follow-ups" del doc del módulo activo y se para.
2. **Ciclo por iteración**: leer spec → acordar contrato (actualizar doc ANTES de código)
   → tests en ROJO → implementación en VERDE → refactor → actualizar "Estado" del doc.
3. **Cambios de contrato** (marcados 🔶): actualizar `docs/modules/...md` +
   `docs/contracts/api-contract.md` si toca frontera + entrada en changelog de
   `PROJECT.md` + regenerar `openapi.json`/snapshot/tipos frontend cuando aplique.
4. **Cierre**: suites completas verdes (§0) + cobertura ≥80 % del módulo.
5. Prompt base para cada iteración (rellenar):

```
Estoy iterando sobre el módulo <id> – <nombre> del proyecto TerraScrap.
Contexto cargado: PROJECT.md, docs/modules/<ruta>/<módulo>.md y PLAN_REMEDIACION.md (iteración <IT-XX>).
Objetivo de esta iteración: <objetivo de la IT-XX>.
Aplica el ciclo SDD → TDD (rojo → verde → refactor). No modifiques ningún otro módulo.
```

**Tallas**: S ≈ <1 h · M ≈ 1–3 h · L ≈ 3–8 h.

---

## 2. FASE 0 — Estabilizar la línea base (antes de cualquier otra iteración)

### IT-00A · tests de B6 app-bootstrap · **S** · cierra N01
- **Problema**: `test_create_app_returns_fastapi_with_routes_mounted`
  (`backend/tests/unit/app_bootstrap/test_app_bootstrap.py:38`) asume que `app.routes`
  contiene los `APIRoute` aplanados. FastAPI 0.139 (resuelto por los rangos abiertos de
  `pyproject.toml`) representa el router incluido como `_IncludedRouter` sin `.path`.
  **La app funciona** (verificado: `GET /api/items` → 200); solo la introspección del
  test es obsoleta.
- **Rojo**: el test ya está en rojo.
- **Verde**: sustituir la introspección por peticiones reales con `TestClient`
  (`GET /healthz` → 200, `GET /api/items?q=x` → 200/503, `POST /api/worlds` sin body →
  422) o recorrer rutas recursivamente aceptando routers anidados.
- Sin cambio de contrato.

### IT-00B · infra repo (raíz) · **S** · cierra N02
- **Problema**: no existe `.gitattributes`; con `core.autocrlf=true` el checkout Windows
  produce CRLF y Prettier falla en todos los ficheros (en CI Linux pasa → resultado
  distinto por SO).
- **Verde**: añadir `.gitattributes` con al menos:
  ```
  * text=auto
  *.ts text eol=lf
  *.tsx text eol=lf
  *.css text eol=lf
  *.json text eol=lf
  *.md text eol=lf
  *.py text eol=lf
  *.yml text eol=lf
  *.sh text eol=lf
  *.wld -text
  ```
  y ejecutar `git add --renormalize .` en un commit propio.
- **Verificación**: checkout limpio en Windows + `npm run lint` verde sin tocar config git.

### IT-00C · infra backend (`pyproject.toml`) · **M** · cierra N03, G05
- **Problemas**:
  - Dependencias sin cota superior → hoy resuelven FastAPI 0.139/Starlette 1.3+ y rompen
    un test; el CI puede romper en cualquier momento sin cambiar el repo (N03). Además
    `TestClient` emite `StarletteDeprecationWarning` ("usar httpx2").
  - `pytest-cov` no está en `[dev]` pese a que CLAUDE.md exige cobertura ≥80 % (G05).
- **Verde**: añadir cotas superiores conservadoras (`fastapi>=0.136.3,<0.140`,
  `starlette<2`, `pydantic<3`, …) o un fichero de constraints/lock (`uv lock` o
  `pip-compile`); añadir `pytest-cov>=5` a `[dev]` y documentar el comando
  `pytest --cov=twi --cov-report=term-missing` en CLAUDE.md (la edición de CLAUDE.md se
  hace en IT-DOC-1 para no tocar dos “módulos”).
- **Verificación**: `pip install -e ".[dev]"` reproducible + suite verde.

---

## 3. FASE 1 — Críticos de servidor y cliente

### IT-01 · B5 api-rest · **M** · 🔶 · cierra E01, E02
- **Problemas**:
  - E01 — `jobs: dict[str, _ImportJob]` (`router.py:444`) nunca se purga: fuga de memoria
    garantizada en servidor de vida larga.
  - E02 — `_do_import` (`router.py:514-539`) solo captura `UnsupportedWorldVersionError` y
    `WldParseError`; cualquier otra excepción del hilo deja el job en `processing` para
    siempre.
- **Contrato** 🔶: documentar en `api-contract.md` la retención de jobs (propuesta: un job
  en estado terminal —`done`/`error`— expira a los **15 min**; consultar un job expirado →
  `404 job_not_found`). Añadir código de error `import_failed` para fallos inesperados.
- **Rojo**:
  - `test_import_job_unexpected_exception_marks_job_error` (parser inyectado que lanza
    `RuntimeError` → status `error`, `error_code="import_failed"`, sin traza en el body).
  - `test_import_jobs_expire_after_terminal_ttl` (clock inyectable, mismo patrón que B2).
  - `test_import_jobs_purge_bounded` (N jobs terminales → dict acotado).
- **Verde**: `except Exception` final en `_do_import` (log `ERROR` + estado `error`);
  timestamp `finished_at` en `_ImportJob`; purga perezosa en cada acceso al dict (o
  entrada en el purge loop de B6 vía callable inyectado — si se elige esto, anotarlo como
  follow-up de B6, no tocarlo aquí).

### IT-02 · F1 api-client · **M** · 🔶 · cierra E03
- **Problema**: `pollImportJob` (`client.ts:186-215`) es un `for(;;)` sin tope: si el job
  desaparece del servidor o queda colgado, la UI se queda en "Procesando…" para siempre.
- **Contrato** 🔶 (`api-client.md`): `uploadWorld(file, {onProgress, timeoutMs?})`;
  por defecto timeout global de polling de **5 min** y máx. 3 errores de red consecutivos
  → rechaza con `ApiError('import_timeout' | 'import_error')`.
- **Rojo** (fake timers): timeout expira → `import_timeout`; 404 del job → error
  inmediato; 3 fallos de red seguidos → error; caso feliz sigue en verde.
- **Verde**: contador de tiempo/intentos en el bucle; abortable con `AbortSignal`
  (opcional, mismo patrón que `searchItems`).

### IT-03 · B5 api-rest · **M** · 🔶 · cierra E10, M01, M04, M19, D03
- **Problemas**:
  - E10 — `STATUS_CODE_TO_ERROR_CODE[404]="world_not_found"` (`errors.py:29-34`): un 404
    de ruta inexistente responde `world_not_found` (código falso en el contrato).
  - M01 — `TileEntityDto` (`schemas.py:70`) exportado y jamás servido por ningún endpoint.
  - M04 — handler registrado de `UploadTooLargeError` (`errors.py:90-94`) inalcanzable
    (la excepción la captura `XApiVersionMiddleware` antes de llegar a los handlers).
  - M19 — `_err` (`router.py:77-83`) es un alias trivial de `error_response`.
  - D03 — patrón `repo.get()/except → 404` copiado en 6 handlers; check 413 duplicado ×2;
    construcción de `SearchMatchDto` ×2 y de `TilesChunkDto` ×2.
- **Contrato** 🔶: en `api-contract.md`, el 404 genérico pasa a `code:"not_found"`
  (reservando `world_not_found` a `/worlds/*`); eliminar `TileEntityDto` del contrato
  (o marcarlo "reservado v0.3" y quitarlo de exports). Regenerar `openapi.json` +
  snapshot + tipos frontend.
- **Rojo**: `test_unknown_route_returns_generic_not_found_code`;
  test de import que falle si `TileEntityDto` sigue en `twi.api_rest.__all__`;
  los tests existentes protegen el refactor de dedup.
- **Verde**: mapa de códigos corregido; borrar handler muerto, `_err` y `TileEntityDto`;
  helper `_get_world_or_404(repo, world_id)` + `_check_upload_size(data)` + constructor
  único de `SearchMatchDto`/`TilesChunkDto`; en `get_tiles` hoistar la llamada común a
  `_chunk_surface_y` (hoy duplicada en `router.py:639` y `:650`).

### IT-04 · B6 app-bootstrap/observability · **M** · cierra E13, E20, M03, D05, P08
- **Problemas**:
  - E13 — `int(content_length)` (`app.py:74`) puede lanzar `ValueError` → 500.
  - E20 — en 500 no manejados la respuesta se genera fuera de `RequestContextMiddleware`:
    se filtra `X-Error-Code: internal_error` al cliente y falta `X-Request-Id`.
  - M03 — `current_request_id` (`observability.py:41`) se set/reset pero nadie lo lee.
  - D05 — `ERROR_CODE_HEADER` definido dos veces (`errors.py:27` y `observability.py:30`).
  - P08 — el purge loop loguea cada 60 s aunque purgue 0 (ruido).
- **Rojo**: `test_malformed_content_length_returns_400`;
  `test_unhandled_error_response_has_request_id_and_no_error_code_header`;
  `test_purge_logs_only_when_purged` (caplog).
- **Verde**: try/except en el parse del header (→ 400 `validation_error`); el handler de
  `Exception` añade `X-Request-Id` desde `request.state` y no emite `X-Error-Code`;
  eliminar `current_request_id`; `observability.py` importa `ERROR_CODE_HEADER` desde
  `twi.api_rest.errors` (B6 depende de B5: dirección permitida) y borra su copia;
  `if purged: log`.

### IT-05 · B5 api-rest · **M** · cierra E12
- **Problema**: `await file.read()` (`router.py:462` y `:505`) carga el body completo en
  RAM **antes** del check 413; una subida chunked sin `Content-Length` elude además el
  middleware de B6 → vector de agotamiento de memoria con 200 MB+ por request.
- **Rojo**: test de streaming: `UploadFile` falso cuyo `read(n)` sirve por bloques; con
  payload > límite debe responder 413 **sin** haber consumido más de `límite + 1 chunk`;
  test de igualdad de comportamiento para ficheros válidos.
- **Verde**: helper `_read_upload_capped(file, max_bytes)` que lee en chunks de 1 MiB y
  corta en cuanto excede; usarlo en `/worlds` y `/world-imports`.
- Sin cambio de contrato (el 413 ya existe).

---

## 4. FASE 2 — Frontend: F3 primero, luego consumidores

### IT-06 · F3 world-canvas (paleta) · **M** · cierra E04, M12, D01
- **Problemas**:
  - E04 — `tileColors.ts:135`: `125: '#8daff'` hex de 5 dígitos (typo de `#8dafff` del
    fallback). En la ruta v2 `hexToRgb` produce RGB(141,175,15) — color equivocado; en la
    v1 `fillStyle` inválido reutiliza el color anterior. Revisar también 245/246
    (`#633220` vs `#63321e`) y 637/638 (`#c87850` vs `#c8784b`) contra TerraMap.
  - D01 — de las 346 entradas de `TILE_COLORS`, 331 existen también en
    `FALLBACK_TILE_COLORS` y **316 son idénticas byte a byte** (paredes: 182/188, 175
    idénticas). ~490 líneas duplicadas que ya produjeron el typo.
  - M12 — entrada centinela `10000: DRESSER_COLOR` (autodocumentada "unused").
- **Rojo**:
  - `tileColors should only contain overrides that differ from the fallback` (recorre
    ambos dicts y falla si hay entrada idéntica duplicada).
  - `all palette entries should be valid #rrggbb` (regex sobre TODAS las entradas de
    `tileColors.ts` y `tilePaletteFallback.ts`) — este test previene la clase entera.
  - `getTileColor(125) should return #8dafff`.
- **Verde**: reducir `TILE_COLORS`/`WALL_COLORS` a los ~40 overrides reales (cofres,
  divergencias deliberadas verificadas); borrar centinela; corregir/validar los 4 colores
  sospechosos. `getTileColor/getWallColor` no cambian de firma (sin cambio de contrato).

### IT-07 · F3 world-canvas (interacción/zoom) · **M** · 🔶 · cierra E05, E07, E15, D04(parte)
- **Problemas**:
  - E05 — el zoom por rueda (`WorldCanvas.tsx:370-380`) muta `viewRef` sin notificar al
    exterior → el estado de app-shell queda desincronizado.
  - E07 — `handleClick` (`WorldCanvas.tsx:415-428`) no suprime el click posterior a un
    drag: cada pan termina en `SELECT_TILE` + `GET /tile`.
  - E15 — `zoomToFit` (`WorldCanvas.tsx:332-336`) clampa a `MIN_ZOOM=0.25`: un mundo
    large (8400 tiles) no cabe en pantallas normales.
  - D04 — `MIN_ZOOM/MAX_ZOOM/INITIAL_ZOOM` duplicadas en `WorldCanvas.tsx:22-24` y
    `appState.ts:3-6`.
- **Contrato** 🔶 (`world-canvas.md`): añadir `onZoomChange?: (zoom: number) => void` a
  `WorldCanvasProps` (disparado en rueda, setZoom y zoomToFit); exportar
  `ZOOM_LIMITS = { min, max, initial, step }` desde `world-canvas/index.ts`;
  `zoomToFit` puede devolver un zoom < `min` cuando el mundo no cabe (documentarlo).
- **Rojo**: test rueda → `onZoomChange` llamado con el nuevo zoom; test drag >5 px + click
  → `onTileSelected` NO llamado; test click sin movimiento → sí llamado; test zoomToFit
  con mundo 8400×2400 y canvas 800×600 → zoom == min(w/W, h/H) sin clamp inferior.
- **Verde**: acumulador de distancia en `mousedown/mousemove` con umbral 5 px;
  `onZoomChangeRef` invocado en los tres caminos; constantes unificadas.

### IT-08 · F3 world-canvas (pipeline de datos) · **L** · cierra E08, E09, P03, P07, M09
- **Problemas**:
  - E08 — dos efectos solapados (`WorldCanvas.tsx:248-257` y `:259-264`): al cambiar de
    mundo, el segundo limpia `pendingRef` mientras la primera tanda de fetches vuela →
    **cada chunk visible se descarga dos veces**.
  - E09 — togglear Paredes/Líquidos limpia el bitmap cache y **re-descarga de red** todos
    los chunks; bastaría re-rasterizar el `DecodedChunkV2` ya descargado.
  - P03 — `CHUNK_SIZE` fijo 128 (`WorldCanvas.tsx:21`); el backend admite hasta 512. Un
    zoom-to-fit en mundo large son ~1 254 requests; con 512 serían ~85.
  - P07 — `chunkBitmapCache` (`chunkBitmapCache.ts:50-69`) sin tope → ~80 MB+ de
    canvases tras recorrer un mundo grande.
  - M09 — ruta de render v1 (`renderChunkBitmap` + `paintBackdrop`) duplica la lógica de
    banding de la ruta v2 y es inalcanzable en producción (el cliente siempre pide v2).
- **Rojo**: test "world change triggers exactly one fetch per visible chunk" (apiClient
  mock contando llamadas); test "layer toggle re-renders without network"; test LRU
  (cap N, se desaloja el menos usado); tests de `chunkSizeForZoom(zoom)` (p. ej. ≥1→128,
  <1→256, ≤0.5→512); tests existentes de v1 se adaptan al renderer unificado.
- **Verde**: un único efecto por `worldId` + re-render local para capas con caché
  `Map<key, DecodedChunkV2>` (LRU); LRU también en bitmaps; `chunkSizeForZoom`;
  unificar render: decodificar v1 a un `DecodedChunkV2` parcial (solo `tileId`) y borrar
  `renderChunkBitmap`/`paintBackdrop` (la compat v1 queda en el decoder, ver §5-DEC).
- Sin cambio de contrato público (props iguales).

### IT-09 · F6 app-shell · **L** · cierra E06, E14(corto), E16, E18, M10, M11, D02, D04(resto)
- **Problemas**:
  - E06 — HUD `+`/`−` (`App.tsx:402,410`) hardcodean `8/0.25/0.5` y **no despachan
    `SET_ZOOM`** → `state.zoom` se queda en 2 y el HUD nunca pasa de 2.5.
  - E16 — carga de detalle de tile (`App.tsx:208-217`) sin abort/generación → respuesta
    obsoleta puede pisar a la nueva.
  - E18 — `handleUploaded` (`App.tsx:130-131`) usa `sessionStorage.setItem` sin
    try/catch (el resto del fichero sí se protege).
  - E14 corto plazo — la capa "Cables" no pinta nada (el backend no emite esos bits) y
    arranca ON (`appState.ts:57`).
  - M10 — `SK_META` es write-only (se escribe en `App.tsx:105,131`, nunca se lee).
  - M11 — `panels.tile` + acción `TOGGLE_PANEL('tile')` (`appState.ts:28,42`): se escribe
    y nunca se lee/despacha.
  - D02 — ~450 líneas de datos (`TILE_NAMES`/`WALL_NAMES`) incrustadas en
    `TileDetailPanel.tsx` (462-543): mover a `app-shell/components/tileNames.ts` junto al
    fallback (misma organización que la paleta de F3).
- **Rojo**: test HUD zoom in ×2 → `setZoom(2.5)` y luego `setZoom(3)`; test
  `onZoomChange` del canvas actualiza el % de Toolbar; test carga de detalle con dos
  clicks rápidos → gana el último; test `sessionStorage` que lanza → la app no crashea y
  el mundo carga; test capa wires OFF por defecto y botón con `disabled`/`title`.
- **Verde**: consumir `onZoomChange` (IT-07) → `dispatch SET_ZOOM` (fuente única);
  HUD reutiliza `ZOOM_LIMITS`; AbortController/generación en tile-detail; try/catch en
  `handleUploaded`; `wires: false` por defecto + botón deshabilitado con título
  "Disponible en v0.3" (rehabilitación real: IT-OPT-2..5); eliminar `SK_META` y
  `panels.tile`/rama `'tile'`; extraer tablas de nombres a módulo de datos.
- **Contrato**: `app-shell.md` (reducer sin `panels.tile`; consumo de `onZoomChange`).

### IT-10 · F4 search-panel · **S** · cierra E17, M13
- **Problemas**:
  - E17 — `runSearch` (`SearchPanel.tsx:145-167`) sin generación/abort: dos búsquedas
    rápidas pueden mostrar resultados del ítem anterior (el autocompletado sí tiene
    contador; la búsqueda no).
  - M13 — `SOURCE_LABEL` (`SearchPanel.tsx:14-16`) incluye claves `tile`/`liquid`/
    `tile_entity` que el contrato v0.2 no puede emitir.
- **Rojo**: test con dos `searchInWorld` en vuelo resueltas en orden inverso → se muestra
  la última; test de que `SOURCE_LABEL` solo cubre los sources del contrato.
- **Verde**: contador de generación (patrón ya usado en autocompletado); eliminar claves
  muertas (si se quieren conservar para v0.3, moverlas a comentario en el doc del módulo).

### IT-11 · F5 highlight-overlay · **M** · 🔶 · cierra P05, M14, M16
- **Problemas**:
  - P05 — el bucle rAF (`HighlightOverlay.tsx:175-237`) corre siempre, incluso sin
    matches ni tile seleccionado; `colorWithAlpha` ejecuta una regex por match y frame
    (hasta ~60 k regex/s con 500 matches).
  - M14 — `DEFAULT_SOURCE_COLORS` (`math.ts:27-28`) claves `liquid`/`tile_entity` muertas.
  - M16 — prop `viewport` (`HighlightOverlay.tsx:23`): la app nunca la pasa; duplica el
    camino `canvasHandle` (solo la usan los tests).
- **Contrato** 🔶 (`highlight-overlay.md`): eliminar `viewport` (breaking menor) o
  marcarla deprecated; documentar el "modo reposo".
- **Rojo**: test sin matches/selección → 0 draws tras el primer clear; test caché de
  color (misma entrada ×N → 1 parse); adaptación de tests que usaban `viewport`.
- **Verde**: early-idle (limpiar una vez y pausar hasta que cambien las props — el
  overlay solo necesita animar cuando hay algo que pintar); memo `Map<string,string>` de
  rgba; borrar claves/prop muertas.

### IT-12 · F2 ui-upload · **S** · cierra E21
- **Problema**: `friendlyUploadError` (`UploadWorld.tsx:37-39`) agrupa
  `api_version_mismatch` con `unsupported_version` ("Ese mundo no se puede abrir…") —
  culpa al fichero cuando el problema es de despliegue front/back.
- **Rojo**: test mensaje propio para `api_version_mismatch` ("La aplicación necesita
  actualizarse. Recarga la página." o similar).
- **Verde**: rama propia en el switch.

---

## 5. FASE 3 — Backend: rendimiento y limpieza de dominio

### IT-13 · B5 api-rest (surface_y) · **M** · cierra P01
- **Problema**: `_chunk_surface_y` (`router.py:265-304`) recorre la columna **completa**
  del mundo en cada `GET /tiles`: ~307 k visitas de tile por chunk frente a ~16 k del
  encode (≈19× el coste útil) y se recalcula idéntico para los ~19 `chunk_y` de la misma
  franja. El mundo es inmutable: es cacheable al 100 %.
- **Rojo**: test de equivalencia (resultado cacheado == cálculo directo en mundos con
  islas flotantes/cañones — reutilizar fixtures existentes); test de presupuesto: 2ª
  petición del mismo `chunk_x` no vuelve a escanear (espiar contador o presupuesto de
  tiempo); test de invalidación al borrar el mundo (o LRU acotado).
- **Verde**: caché en el closure del router `dict[(world_id, chunk_size), list[int]]`
  computando el mundo entero la primera vez (una pasada, w·h) con LRU pequeño (p. ej. 4
  mundos); nota en el doc del módulo.

### IT-14 · B5 api-rest (cachés de lectura) · **M** · cierra P02, P06
- **Problemas**:
  - P02 — `_encode_chunk(_v2)` re-recorre y re-encodea los mismos tiles en cada request.
  - P06 — `get_tile` (`router.py:677-691`) hace scans lineales de chests/signs/
    tile_entities por petición.
- **Rojo**: test de que la 2ª petición del mismo chunk devuelve payload idéntico sin
  re-encodear (contador en encoder inyectable o monkeypatch); test índice `(x,y)` de
  chests/signs/entities == comportamiento actual (incluye el caso "primer chest gana").
- **Verde**: LRU `(world_id, cx, cy, size, encoding) → payload` (p. ej. 512 entradas);
  índices por mundo `dict[tuple[int,int], int]` construidos on-demand y cacheados por
  `world_id` (mismo LRU pequeño que IT-13).
- Sin cambio de contrato (payloads idénticos).

### IT-15 · B1 wld-parser · **M** · 🔶 · cierra E11, E19, M08, D06, G08
- **Problemas**:
  - E11 — `read_net_string` (`_reader.py:79-85`): el fallback cp1252 SÍ puede lanzar
    (0x81, 0x8D, 0x8F, 0x90, 0x9D no están definidos en cp1252); el comentario es falso.
  - E19 — `TileGrid.__eq__/__hash__` (`_types.py:127-133`): hash construye una tupla con
    los ~20 M de tiles — footgun de rendimiento.
  - M08 — `except (WldParseError, UnsupportedWorldVersionError)` (`_parser.py:700`):
    el segundo es subclase del primero.
  - D06 — `UnsupportedWorldVersionError` default `supported_range=(230, 319)`
    (`_exceptions.py:24`) duplica `_MIN/_MAX_VERSION` del parser: si mañana se amplía el
    rango, el default queda desfasado en silencio.
  - G08 — `# type: ignore[arg-type]` (`_parser.py:212`) evitable tipando
    `_classify_size` con el `Literal`.
- **Contrato** 🔶 (`wld-parser.md`): documentar decodificación de strings
  (`utf-8` → `latin-1`) y que `TileGrid` no es hashable (breaking menor: tests que
  comparen grids usan helper `assert_grids_equal`).
- **Rojo**: test string con byte 0x81 → parsea sin excepción; test `hash(TileGrid)` →
  `TypeError`; test default de `UnsupportedWorldVersionError` importa las constantes.
- **Verde**: `raw.decode("latin-1")` como fallback (o `errors="replace"`); eliminar
  `__hash__`/`__eq__` (o `__hash__ = None`); simplificar el `except`; mover
  `_MIN/_MAX_VERSION` a `_exceptions.py` (o a un `_constants.py`) y consumirlos en ambos;
  `_classify_size(...) -> Literal["small","medium","large"]` y quitar el ignore.

### IT-16 · B2 world-repository · **M** · 🔶 · cierra M02, P10
- **Problemas**:
  - M02 — `touch()` y `delete()` no estricto (`_repository.py:77-101`) sin ningún caller
    de producción (el `get()` ya refresca TTL; iter-032 migró a `delete_strict`).
  - P10 — sin límite de mundos simultáneos: N uploads = N×(200-600 MB) en RAM hasta TTL.
- **Contrato** 🔶 (`world-repository.md`, breaking v2.0): eliminar `touch` y `delete` del
  Protocol (migrar los tests que los usaban); `create_in_memory_repository(ttl_seconds,
  clock, max_worlds: int | None = None)` — al superarlo, expulsa el mundo menos
  recientemente accedido (LRU, coherente con "sesión efímera"). B6 expone
  `TWI_MAX_WORLDS` (follow-up B6 anotado, no tocar aquí).
- **Rojo**: tests de que `touch`/`delete` ya no existen en el Protocol; test cap: al
  guardar el mundo N+1 se expulsa el LRU y `get()` del expulsado → `WorldNotFoundError`.
- **Verde**: implementación directa; changelog PROJECT.md.

### IT-17 · B3 item-catalog · **S** · cierra M05, M06, M07, G07
- **Problemas**:
  - M05 — `except (ValueError, OverflowError)` en `_parse_id` (`catalog.py:53`):
    `int(str)` nunca lanza `OverflowError`.
  - M06 — `try/except WikiUnavailableError: raise` (`scraper.py:170-173`): no-op.
  - M07 — `except (httpx.TimeoutException, httpx.TransportError)` (`scraper.py:39`):
    `TimeoutException` es subclase de `TransportError`.
  - G07 — `dict[str, Any]` en `catalog.py:111` y `scraper.py` (varias) contra el
    "Sin `Any` explícito" de CLAUDE.md.
- **Rojo**: los tests existentes protegen; añadir test de cache con `item_id` duplicado
  (hoy `_by_id` pisa en silencio y `_index` conserva ambos → decidir: error o dedupe).
- **Verde**: limpiar los tres puntos muertos; sustituir `Any` por `TypedDict`
  (`_CacheItem`, `_CachePayload`) u `object` + validación.

---

## 6. FASE 4 — Infra frontend

### IT-18 · infra frontend · **S** · cierra M17, M18/D07, G06
- **Problemas**:
  - M17 — `package.json`: scripts `gen:api` y `generate:api-types` idénticos.
  - M18/D07 — dos configs de Vitest: el bloque `test:` de `vite.config.ts` está **muerto**
    (Vitest usa `vitest.config.ts` al existir) y ambos **divergen** (solo
    `vitest.config.ts` incluye `.spec.` y js/jsx).
  - G06 — `vite.config.ts` no está incluido en ningún tsconfig (no se typechequea;
    `tsconfig.node.json` solo incluye `vitest.config.ts`).
- **Verde**: borrar `generate:api-types`; dejar UNA config (recomendado: mover `test` a
  `vite.config.ts` con `/// <reference types="vitest" />` + plugin react y borrar
  `vitest.config.ts`, actualizando `tsconfig.node.json`); el test
  `tests/vite-config/dev-proxy.test.ts` sigue verde.
- **Verificación**: `npm test` mismo número de tests (236) + `npm run build` verde.

---

## 7. FASE 5 — Documentación y gobernanza (solo docs)

### IT-DOC-1 · docs/CLAUDE.md/PROJECT.md · **M** · cierra G01, G02, G03, G04, G09, N04, D08
- **Problemas y cambios**:
  - G01 — CLAUDE.md "Riesgos críticos": dice **v230–v279**; parser y `wld-parser.md`
    soportan **v230–v319**. Peligro real: una iteración futura obediente a CLAUDE.md
    podría "corregir" al rango antiguo. → Actualizar a v230–v319.
  - G02 — CLAUDE.md: TTL "configurable con `TWI_MAX_UPLOAD_MB`" → variable correcta
    `TWI_WORLD_TTL_SECONDS`.
  - G03 — `POST/GET /api/world-imports` existen en `openapi.json` y snapshot pero **no**
    en `api-contract.md` ni en el changelog de PROJECT.md (commit `8181061`); la tabla de
    endpoints de CLAUDE.md tampoco los lista. → Sección nueva en `api-contract.md`
    (202 + polling + códigos + retención IT-01), fila en la tabla de CLAUDE.md y entrada
    retroactiva en el changelog.
  - G04 — `.gitignore` cabecera "React 18" → React 19.
  - G09/N04 — changelog: `backend.Dockerfile` es `python:3.12-alpine` (no slim);
    métrica de bundle real 94 kB gzip (no 72). → Nota de corrección en §14 de PROJECT.md.
  - D08 — documentar la fuente única del límite de subida (`.env` → `TWI_MAX_UPLOAD_MB`,
    consumido por Settings/router/UploadWorld; nginx 250 m = headroom deliberado).
  - Añadir además el comando de cobertura (`pytest --cov=twi`) cuando IT-00C esté cerrada.
- **Verificación**: no hay código que ejecutar; revisar con `git diff` que solo cambian
  docs y regenerar nada.

---

## 8. FASE 6 — Opcionales (v0.3 / mejoras mayores)

### IT-OPT-1 · B1 wld-parser · **L** · cierra P04
- `TileGrid` columnar (arrays tipados/numpy) e **índices lazy** por `tile_id` (hoy
  `_build_position_indexes` es una 2ª pasada completa de ~20 M tiles en tiempo de parseo,
  y la grid de objetos `Tile` cuesta cientos de MB por mundo). Presupuestos: parse Large
  <10 s (RNF-01) y search <500 ms (RNF-03) ya cubiertos por tests perf existentes.
  Sin cambio de contrato si se preserva la interfaz de `TileGrid`.

### IT-OPT-2..5 · cadena "cables" (E14 solución real) · **L**
- IT-OPT-2 (B1): descomponer `Tile.flags` en `wire_red/blue/green/yellow`, `actuator`
  (contrato v2.2 de B1).
- IT-OPT-3 (B5): emitir los bits 1–5 del byte `flags` del encoding v2 (el layout ya los
  reserva — `router.py:368-369` — así que NO es breaking; actualizar api-contract §5.2).
- IT-OPT-4 (F3): pintar wires con los bits reales (el mask `0b0011_1100` de
  `chunkBitmapCache.ts:187` ya los espera).
- IT-OPT-5 (F6): rehabilitar el toggle "Cables" (revierte la parte cosmética de IT-09).

### IT-OPT-6 · B3 item-catalog · **S** · cierra P09
- `_enrich_items` secuencial (6 146 páginas): `asyncio.Semaphore(4-8)` + `gather` con
  backoff — es CLI (`refresh.py`), sin impacto en runtime del servidor.

---

## 9. Decisiones explícitas de NO acción (registradas para que no reaparezcan como hallazgos)

| ID | Elemento | Decisión |
|---|---|---|
| DEC-1 (M15) | `frameX/frameY` en `DecodedChunkV2` (`rleDecoder.ts`) decodificados y no usados por el render | **Mantener**: son parte del formato v2 y los usará el tooltip/inspector v0.3; coste transitorio (se liberan tras rasterizar). Anotar en `world-canvas.md`. |
| DEC-2 | `decodeBase64RleV1` (decoder, no el renderer) | **Mantener**: `base64-rle-v1` sigue siendo el default del contrato API; solo se elimina el *renderer* duplicado (IT-08). |
| DEC-3 | Códigos `invalid_coordinates` + `coordinates_out_of_bounds` en `errorCodes.ts` | **Mantener ambos**: divergencia histórica documentada en changelog iter-09; el front debe tolerar los dos. |
| DEC-4 | `scripts/_gen_world_map.py` fuera del lint (ruff solo cubre `src`/`tests`) | **Mantener**: es un generador one-shot documentado; opcionalmente añadir `scripts` a ruff en IT-00C. |
| DEC-5 | Warning deprecación `TestClient`/httpx | Se acepta hasta IT-00C (pin) o migración futura de Starlette; no accionable hoy sin fijar versiones. |

---

## 10. Trazabilidad hallazgo → iteración (cobertura 100 %)

| ID | Hallazgo (resumen) | Dónde | Iteración |
|---|---|---|---|
| E01 | Leak dict `jobs` sin purga | `router.py:444` | IT-01 |
| E02 | `_do_import` sin catch-all → job colgado | `router.py:514` | IT-01 |
| E03 | `pollImportJob` sin timeout → UI congelada | `client.ts:186` | IT-02 |
| E04 | Hex inválido tile 125 (+245/246/637/638 sospechosos) | `tileColors.ts:135` | IT-06 |
| E05 | Zoom por rueda no notifica (desync) | `WorldCanvas.tsx:370` | IT-07 (+IT-09) |
| E06 | HUD ± sin `SET_ZOOM` (se queda en 2.5) | `App.tsx:402,410` | IT-09 |
| E07 | Click tras drag selecciona tile | `WorldCanvas.tsx:415` | IT-07 |
| E08 | Doble fetch de chunks al cambiar mundo | `WorldCanvas.tsx:248-264` | IT-08 |
| E09 | Toggle de capas re-descarga de red | `WorldCanvas.tsx:259` | IT-08 |
| E10 | 404 genérico responde `world_not_found` | `errors.py:29` | IT-03 |
| E11 | Fallback cp1252 puede lanzar | `_reader.py:85` | IT-15 |
| E12 | Body entero a RAM antes del 413 / bypass chunked | `router.py:462,505` `app.py:73` | IT-05 |
| E13 | `int(Content-Length)` → 500 con header malformado | `app.py:74` | IT-04 |
| E14 | Capa "Cables" no-op y ON por defecto | `chunkBitmapCache.ts:187` `appState.ts:57` | IT-09 (corto) + IT-OPT-2..5 |
| E15 | `zoomToFit` clampado por MIN_ZOOM | `WorldCanvas.tsx:332` | IT-07 |
| E16 | Race en carga de tile-detail | `App.tsx:208` | IT-09 |
| E17 | Race en `runSearch` | `SearchPanel.tsx:145` | IT-10 |
| E18 | `sessionStorage.setItem` sin try/catch | `App.tsx:130` | IT-09 |
| E19 | `TileGrid.__hash__/__eq__` O(20M) | `_types.py:127` | IT-15 |
| E20 | 500: filtra `X-Error-Code`, sin `X-Request-Id` | `observability.py`/`errors.py` | IT-04 |
| E21 | Mensaje engañoso `api_version_mismatch` | `UploadWorld.tsx:38` | IT-12 |
| P01 | `surface_y` recomputado (+llamada duplicada) | `router.py:265,639,650` | IT-13 (hoist en IT-03) |
| P02 | Sin caché de chunks codificados | `router.py` | IT-14 |
| P03 | `chunk_size` fijo 128 | `WorldCanvas.tsx:21` | IT-08 |
| P04 | TileGrid Python puro + índices eager | `_types.py` | IT-OPT-1 |
| P05 | rAF continuo + regex por frame | `HighlightOverlay.tsx:175,34` | IT-11 |
| P06 | `get_tile` scans lineales | `router.py:677` | IT-14 |
| P07 | bitmapCache sin LRU | `chunkBitmapCache.ts:50` | IT-08 |
| P08 | Log de purga aunque purgue 0 | `app.py:95` | IT-04 |
| P09 | Enrich del scraper secuencial | `scraper.py:160` | IT-OPT-6 |
| P10 | Sin cap de mundos simultáneos | `_repository.py` | IT-16 |
| M01 | `TileEntityDto` sin endpoint | `schemas.py:70` | IT-03 |
| M02 | `touch()`/`delete()` sin caller de producción | `_repository.py:77,92` | IT-16 |
| M03 | `current_request_id` nunca leído | `observability.py:41` | IT-04 |
| M04 | Handler `UploadTooLargeError` inalcanzable | `errors.py:90` | IT-03 |
| M05 | `except OverflowError` muerto | `catalog.py:53` | IT-17 |
| M06 | try/except reraise no-op | `scraper.py:170` | IT-17 |
| M07 | `TimeoutException` redundante | `scraper.py:39` | IT-17 |
| M08 | `except` con subclase redundante | `_parser.py:700` | IT-15 |
| M09 | Renderer v1 duplicado e inalcanzable | `chunkBitmapCache.ts:71,198` | IT-08 |
| M10 | `SK_META` write-only | `App.tsx:25,105,131` | IT-09 |
| M11 | `panels.tile` + `TOGGLE_PANEL('tile')` muertos | `appState.ts:28,42` | IT-09 |
| M12 | Centinela `10000` + `DRESSER_COLOR` | `tileColors.ts:357` | IT-06 |
| M13 | `SOURCE_LABEL` claves imposibles | `SearchPanel.tsx:14` | IT-10 |
| M14 | `DEFAULT_SOURCE_COLORS` claves imposibles | `math.ts:27` | IT-11 |
| M15 | `frameX/frameY` decodificados sin uso | `rleDecoder.ts:117` | DEC-1 (mantener) |
| M16 | Prop `viewport` solo usada en tests | `HighlightOverlay.tsx:23` | IT-11 |
| M17 | Script npm duplicado | `package.json` | IT-18 |
| M18 | Bloque `test` de vite.config muerto | `vite.config.ts` | IT-18 |
| M19 | `_err` alias trivial | `router.py:77` | IT-03 |
| D01 | Paletas: ~490 entradas idénticas duplicadas | `tileColors.ts`/`tilePaletteFallback.ts` | IT-06 |
| D02 | Tablas de nombres dentro del componente | `TileDetailPanel.tsx` | IT-09 |
| D03 | Router: 404×6, 413×2, DTOs×2 | `router.py` | IT-03 (+IT-05) |
| D04 | Constantes de zoom ×3 | `appState.ts`/`WorldCanvas.tsx`/`App.tsx` | IT-07 + IT-09 |
| D05 | `ERROR_CODE_HEADER` ×2 módulos | `errors.py:27`/`observability.py:30` | IT-04 |
| D06 | `supported_range` default duplicado | `_exceptions.py:24` | IT-15 |
| D07 | Configs Vitest ×2 divergentes | `vite.config.ts`/`vitest.config.ts` | IT-18 |
| D08 | Límite de subida en 4 sitios | Settings/router/UploadWorld/nginx | IT-DOC-1 |
| G01 | CLAUDE.md: rango v230–v279 obsoleto | `CLAUDE.md` | IT-DOC-1 |
| G02 | CLAUDE.md: env var del TTL equivocada | `CLAUDE.md` | IT-DOC-1 |
| G03 | `/world-imports` sin contrato ni changelog | `api-contract.md`/`PROJECT.md` | IT-DOC-1 |
| G04 | `.gitignore` dice "React 18" | `.gitignore` | IT-DOC-1 |
| G05 | `pytest-cov` ausente vs cobertura exigida | `pyproject.toml` | IT-00C |
| G06 | `vite.config.ts` sin typecheck | `tsconfig.node.json` | IT-18 |
| G07 | `Any` explícito contra convención | `catalog.py`/`scraper.py` | IT-17 |
| G08 | `type: ignore` evitable | `_parser.py:212` | IT-15 |
| G09 | Changelog: Dockerfile slim→alpine | `PROJECT.md` | IT-DOC-1 |
| N01 | Test de rutas roto con FastAPI 0.139 | `test_app_bootstrap.py:38` | IT-00A |
| N02 | Sin `.gitattributes` (CRLF rompe Prettier) | raíz | IT-00B |
| N03 | Deps backend sin cota superior (drift CI) | `pyproject.toml` | IT-00C |
| N04 | Métrica de bundle desactualizada (94 vs 72 kB) | `PROJECT.md` | IT-DOC-1 |

---

## 11. Orden recomendado de ejecución

```
FASE 0:  IT-00A → IT-00B → IT-00C          (línea base 100 % verde y reproducible)
FASE 1:  IT-01 → IT-02 → IT-03 → IT-04 → IT-05   (estabilidad servidor/cliente)
FASE 2:  IT-06 → IT-07 → IT-08 → IT-09 → IT-10 → IT-11 → IT-12
         (IT-07 antes que IT-09: el contrato onZoomChange lo consume app-shell)
FASE 3:  IT-13 → IT-14 → IT-15 → IT-16 → IT-17
FASE 4:  IT-18
FASE 5:  IT-DOC-1                           (con todo lo anterior ya reflejable)
FASE 6:  IT-OPT-1 · IT-OPT-2..5 · IT-OPT-6  (opcionales, cuando aporten valor)
```

Las fases 1–4 son paralelizables entre backend y frontend si lo hacen personas/sesiones
distintas (nunca dos iteraciones sobre el mismo módulo a la vez). IT-DOC-1 se hace al
final para documentar el estado real, salvo G01/G02/G03 que pueden adelantarse si se va a
iterar sobre B1/B5 antes (evita que una IA siga specs desactualizadas).
