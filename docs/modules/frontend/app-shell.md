# Módulo `F6 – app-shell`

## 1. Propósito
Composición raíz de la SPA. Inyecta el `ApiClient`, orquesta el estado global mínimo (mundo cargado, resultados de búsqueda actuales) y compone `ui-upload`, `world-canvas`, `search-panel` y `highlight-overlay`. Es el único módulo que conoce a todos los demás.

## 2. Contrato público

```ts
// src/app-shell/index.tsx
export interface AppProps {
  apiClient?: ApiClient;   // inyectable para tests/storybook
}

export const App: React.FC<AppProps>;
```

## 3. Dependencias
- `F1` `F2` `F3` `F4` `F5`.

## 4. No objetivos
- No reimplementa lógica ya resuelta en otros módulos.
- No crea su propio sistema de estado global complejo; basta `useReducer` + contexto.

## 5. Especificación (SDD)
Flujo principal (máquina de estados implícita):

- **SP-01** Estado inicial `NoWorld`: solo se ve `UploadWorld`.
- **SP-02** Tras `onUploaded`, pasa a `WorldLoaded` y se muestran `WorldCanvas` + `SearchPanel`.
- **SP-03** Cuando `SearchPanel.onResults` emite resultados, se actualiza la lista de matches pasada a `HighlightOverlay`.
- **SP-04** `SearchPanel.onMatchFocus(m)` llama `canvasHandle.centerOn(m.x, m.y)`.
- **SP-05** Un botón "Cerrar mundo" vuelve a `NoWorld` tras llamar `apiClient.deleteWorld`.
- **SP-06** Errores de la API muestran un toast no bloqueante.
- **SP-07** Layout raiz fluido: `#root` ocupa el 100 % del viewport y el mundo cargado usa una rejilla estable de dos columnas.
- **SP-08** Persiste `worldId` en `sessionStorage` para recuperar la sesión al recargar. Solo `terra_world_id`: la metadata se revalida siempre contra el backend (IT-09, M10). Un `sessionStorage` que lanza (cuota, modo privado) nunca rompe el flujo de subida (E18).
- **SP-09** (IT-09, E06/D04) `state.zoom` es un **espejo** del zoom real del canvas: la única vía de actualización es `WorldCanvas.onZoomChange → dispatch SET_ZOOM` (sin clamp en el reducer; el canvas ya clampa donde corresponde y `zoomToFit` puede legitimamente quedar bajo `ZOOM_LIMITS.min`). Toolbar y HUD calculan el siguiente paso con `ZOOM_LIMITS` de `world-canvas` (fuente única) y solo llaman `canvasHandle.setZoom/zoomToFit`; no despachan `SET_ZOOM` directamente.
- **SP-10** (IT-09, E16) La carga de detalle de tile se cancela al cambiar la selección: una respuesta obsoleta nunca pisa a la de la selección vigente.
- **SP-11** (IT-OPT-5; antes IT-09) La capa "Cables" arranca **OFF** por defecto (capa opcional, igual que TerraMap) pero su botón está **habilitado**: la cadena IT-OPT-2..4 hizo que el backend emita los bits de wires en el encoding v2 y que F3 los pinte con color por cable, así que togglear "Cables" muestra el cableado real (re-rasterizado local sin red, IT-08).

### Layout raiz
- `#root` debe ocupar `width: 100%` del viewport, sin `max-width`, sin `margin: 0 auto`, sin padding inducido por la plantilla Vite y sin `text-align: center`.
- El `body` no debe inducir scroll horizontal: `margin: 0`, `min-width: 1024px` como breakpoint minimo soportado y `overflow-x: hidden`.
- El arbol React debajo de `App` ocupa todo el viewport disponible con `.app { width: 100%; min-height: 100dvh; }`.
- En estado `WorldLoaded`, `.app-main` es una rejilla de dos columnas: `320px 1fr`. La primera columna contiene `search-panel`; la segunda contiene el host del `world-canvas`.
- El ancho contratado del `search-panel` es fijo: `320px`. Esta iteracion soporta viewports desde `1024px`; por debajo queda fuera de alcance y se registrara como follow-up mobile.
- El host del canvas debe usar `min-width: 0`, `width: 100%`, `height: 100%` y permitir que `WorldCanvas` pinte al `100%` del espacio asignado. El canvas debe escalar cuando cambia el tamano del navegador.
- No debe haber scroll horizontal en viewports `>= 1024px`.
- Alcance de implementacion: solo CSS global, CSS/app-shell y, si hace falta, el componente raiz `App.tsx`. No se toca logica de canvas, internals de `search-panel`, rutas de datos ni contratos de API.

## 6. Plan de tests (TDD)
- [x] `T-01 renders UploadWorld in initial state`
- [x] `T-02 transitions to WorldLoaded on upload`
- [x] `T-03 shows SearchPanel and WorldCanvas after upload`
- [x] `T-04 focuses canvas on match click`
- [x] `T-05 closes world and resets state`
- [x] `T-06 recovers worldId from sessionStorage on mount`
- [x] `T-07 shows toast on API error`
- [x] `test_root_has_no_max_width`
- [x] `test_root_fills_viewport_width`
- [x] `test_root_no_centered_margin`
- [x] `test_root_no_text_align_center`
- [x] `test_layout_grid_two_columns`
- [x] `test_canvas_host_grows_with_viewport`
- [x] `test_search_panel_has_stable_width`
- [x] `test_app_renders_without_console_errors`
- [x] `smoke: toolbar visible with canvas and search-panel in WorldLoaded`
- [x] `toolbar zoom in calls setZoom with incremented value`
- [x] `toolbar export PNG calls exportToPng and createObjectURL`
- [x] `tile selection triggers getTileDetail and shows tile detail panel`
- [x] `NPC list click centers canvas on NPC coords`
- [x] `mobile: sidebar has data-open=false at viewport <768px`

IT-09 (E06, E14 corto, E16, E18, M10, M11, D02, D04 resto):
- [x] `HUD zoom in twice advances the shared zoom state (E06)`
- [x] `onZoomChange from canvas updates the toolbar zoom label (E05 consumidor)` — incluye zoom < min sin clamp
- [x] `rapid double tile selection keeps only the last detail (E16)`
- [x] `sessionStorage failure does not crash the upload flow (E18)`
- [x] `wires layer defaults off and its toggle is disabled (E14 corto)`
- [x] `T-06d handleUploaded persists only worldId to sessionStorage (M10)` (adaptado)
- [x] `layer toggles are passed to WorldCanvas` (adaptado: `showWires: false`)
- [x] `toolbar zoom in calls setZoom with incremented value` (adaptado a `ZOOM_LIMITS`)

## 6b. Desarrollo local

### Comportamiento esperado

En `npm run dev` (Vite en `localhost:5173`), las peticiones a `/api/*` deben llegar a FastAPI en `localhost:8000`, no al dev-server de Vite.

Mecanismo: Vite `server.proxy` redirige `/api` → `http://localhost:8000` con `changeOrigin: true`.
El cliente (`createApiClient`) usa `/api` como `baseUrl` por defecto; en build de producción, nginx sirve tanto el frontend como el proxy a FastAPI, por lo que no se necesita URL absoluta.

**Precondición para `npm run dev`**: el backend debe estar levantado en `:8000` (`uvicorn src.twi.app:app --reload`).

### Verificación manual (anotada 2026-05-11)

```
1. cd backend && uvicorn src.twi.app:app --reload --port 8000
2. cd frontend && npm run dev
3. Abrir http://localhost:5173
4. Subir un .wld válido → POST /api/worlds llega a FastAPI (log uvicorn visible).
```

Esta verificación queda pendiente de confirmación con `.wld` real (ver Deuda).

---

## 7. Notas de implementación
- Usar `useReducer` con `State = NoWorld | { kind: "WorldLoaded"; worldId; metadata; matches }`.
- `HighlightOverlay` se renderiza como hermano del `WorldCanvas` en un contenedor con `position: relative`.
- El `ApiClient` por defecto se crea con `createApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api" })`.

## 8. Performance
- El re-render al recibir muchos matches se aísla: `HighlightOverlay` recibe `matches` por ref-like prop para evitar cascadas.

## 9. Errores
- Gestionados por un `ErrorBoundary` sencillo en la raíz.

## 10. Estado
- **Versión del contrato**: v2.1 (IT-09: reducer sin `panels.tile`; `state.zoom` espejo de `onZoomChange`; el contrato público `AppProps` no cambia)
- **Último cierre**: 2026-07-17 — IT-OPT-5 (cadena E14 4/4): toggle "Cables" rehabilitado
- **Iteración actual**: cerrada

### Cambios IT-OPT-5

- Toggle "Cables" habilitado (revierte la parte cosmética de IT-09): sin
  `disabled` ni `title`; el click togglea `layers.wires` → `showWires` del
  canvas, que pinta el cableado real (IT-OPT-4). **Decisión**: el default se
  mantiene OFF — es una capa opcional, como en TerraMap. Cierra la solución
  real de E14 (cadena IT-OPT-2..5 completa).

### Cambios IT-09

- E06/D04 — el canvas es la fuente única del zoom: `onZoomChange → dispatch
  SET_ZOOM` (el reducer ya no clampa; espeja el valor real, que puede quedar
  bajo `ZOOM_LIMITS.min` tras `zoomToFit`). Toolbar y HUD calculan el paso con
  `ZOOM_LIMITS` importado de `world-canvas` y solo llaman
  `canvasHandle.setZoom/zoomToFit`; eliminadas las constantes duplicadas
  `INITIAL_ZOOM/ZOOM_STEP/MIN_ZOOM/MAX_ZOOM` de `appState.ts` y los límites
  hardcodeados del HUD de `App.tsx`.
- E16 — el efecto de carga de detalle de tile marca la petición como obsoleta
  en su cleanup: dos clicks rápidos siempre muestran el detalle del último.
- E18 — `handleUploaded` envuelve `sessionStorage.setItem` en try/catch: sin
  persistencia la sesión no sobrevive al reload, pero el mundo carga.
- E14 corto — `layers.wires` arranca `false` y el botón "Cables" queda
  `disabled` con `title="Disponible en v0.3"` (rehabilitación: IT-OPT-2..5).
- M10 — eliminado `SK_META` (`terra_world_metadata`): era write-only, la
  metadata siempre se revalida contra el backend al restaurar.
- M11 — eliminados `panels.tile` y la variante `'tile'` de `TOGGLE_PANEL`
  (el panel de detalle ya se muestra por `tileDetail !== null`).
- D02 — `TILE_NAMES`/`WALL_NAMES` extraídas de `TileDetailPanel.tsx` a
  `components/tileNames.ts` (misma organización que la paleta de F3).

### Decisiones tomadas
- `useReducer` con `AppState = NoWorld | WorldLoaded` (tipo discriminado).
- `WorldLoaded` extendido con `selectedTile`, `tileDetail`, `npcs`, `layers`, `maskMode`, `sidebarOpen`, `panels`, `zoom`.
- Estado de tipos separado en `appState.ts`; contexto en `AppContext.tsx`; sub-componentes en `components/`.
- `AppContext` (no exportado desde `index.ts`) proporciona `state/dispatch/canvasHandle` a `Toolbar`, `NpcPanel`, `TileDetailPanel`.
- `onMatchFocus` ahora también despacha `SELECT_TILE` → trigger lazy-load de `getTileDetail`.
- NPC loading: `useEffect` que vigila `panels.npcs && npcs === null`; carga una sola vez por mundo.
- `layers.grid` se pasa como `showLayerLines` a `WorldCanvas`; otros layers (`walls/liquids/wires`) almacenados en estado pero pendientes de contrato F3 (deuda anotada).
- `maskMode` se pasa como `style="mask"` a `HighlightOverlay`.
- `sidebarOpen` inicializa con `window.innerWidth >= 768`; botón toggle en header visible en mobile.
- `canvasHandle` en `useState` (no `useRef`) para que `handleMatchFocus` reciba el valor actual.
- `sessionStorage` persiste `terra_world_id` + `terra_world_metadata`; se recupera en `readSessionState` (lazy init de `useReducer`).
- `deleteWorld` falla silenciosamente: se muestra toast pero se cierra la sesión local igualmente.
- `ErrorBoundary` clase mínima en el mismo fichero.
- Layout `WorldLoaded`: `search-panel` queda a la izquierda con ancho fijo `320px`; `world-canvas` ocupa la columna restante con `minmax(0, 1fr)`.

### Deuda / follow-ups
- Cerrado 2026-05-19: layer toggles `walls/liquids/wires` conectados a props reales de `WorldCanvas`.
- Cerrado 2026-05-19: `zoomToFit()` expuesto por `WorldCanvasHandle` y conectado en toolbar.
- Cerrado 2026-05-19: panel de propiedades del mundo muestra metadata v0.2 (`spawn_x/y`, capas, version, seed, size, hardmode).
- Cerrado 2026-05-19: export PNG compone los canvas visibles dentro de `.app-canvas-container`, incluido overlay.
- Smoke test manual pendiente (requiere backend vivo con `.wld` real).

### Evolución propuesta para paridad con TerraMap

F6 debe coordinar los controles globales, porque es el único módulo que conoce canvas, búsqueda y API.

Pendiente:
- **Toolbar global**: controles anterior/siguiente match.
- **Frame UI**: controles para explotar `frameX/frameY` de F1 si se decide exponer búsqueda por frame en interfaz.

Restricciones:
- no meter lógica de parsing/render en F6.
- no abrir endpoints nuevos hasta que `api-contract.md`, B5 y F1 estén actualizados.
- mantener controles como composición de contratos públicos de F3/F4/F5.
- export PNG: F6 compone los canvas visibles del contenedor; si F5 cambia a render no-canvas, debe exponer una API equivalente de exportación.

Tests mínimos futuros:
- next/previous match llama `centerOn` con wrap-around y actualiza `focusedMatchIndex`.
- `zoom-to-fit` invoca `canvasHandle.zoomToFit()`.
- panel propiedades muestra `world_surface_y` formateado.
