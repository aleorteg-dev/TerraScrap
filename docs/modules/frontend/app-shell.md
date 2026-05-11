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
- **SP-08** Persiste `worldId` en `sessionStorage` para recuperar la sesión al recargar.

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
- **Versión del contrato**: v2.0
- **Último cierre**: 2026-05-11 (toolbar, NPC panel, tile detail panel, layout móvil — iter-19; proxy dev Vite — iter-20b)
- **Iteración actual**: cerrada

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
- Layer toggles `walls/liquids/wires`: almacenados en reducer pero no conectados a WorldCanvas (contrato F3 no tiene esas props todavía). Requiere iter F3.1 + actualización de api-contract.
- `zoomToFit()` en toolbar: WorldCanvasHandle no expone este método aún. Requiere iter F3.2.
- Panel propiedades del mundo (`WorldMetadataDto` extendido: `spawn_x/y`, capas): no implementado. Requiere que F1/api-contract estén al día con `base64-rle-v2`.
- Smoke test manual pendiente (requiere backend vivo con `.wld` real).
- P1 deployment-docker: empaquetar frontend con nginx.
- Iteración mobile full: definir layout drawer / stack por debajo de `768px`.

### Evolución propuesta para paridad con TerraMap

F6 debe coordinar los controles globales, porque es el único módulo que conoce canvas, búsqueda y API.

Controles candidatos:
- **Toolbar global**: cerrar mundo, `zoom-to-fit`, limpiar resaltado, exportar PNG, anterior/siguiente match.
- **Panel "Propiedades del mundo"** (toggleable): usa `WorldMetadataDto` extendido (`spawn_x/y`, `world_surface_y`, `rock_layer_y`, `hell_layer_y`, `version`, `seed`, `size`, `hardmode`).
- **Panel "NPCs"** (toggleable): lista NPCs vía `apiClient.getNpcs(worldId)`. Click en un NPC → `canvasHandle.centerOn(npc.x, npc.y)`. Carga lazy al primer despliegue del panel; cache en estado del reducer.
- **Panel "Tile seleccionado"** (visible cuando `selectedTile != null`): muestra `TileDetailDto` recibido vía `apiClient.getTileDetail(worldId, x, y)` tras `onTileSelect` de F3. Limpiar selección oculta el panel.
- **Estado en reducer**: añadir `selectedTile: {x,y} | null`, `focusedMatchIndex: number | null`, `npcs: NpcSummary[] | null`, `tileDetail: TileDetail | null`, `panels: { properties, npcs, tile }: { open: boolean }`.

Reducer extendido (esquema):
```ts
type WorldLoaded = {
  kind: "WorldLoaded";
  worldId: string;
  metadata: WorldMetadata;
  matches: SearchMatch[] | null;
  focusedMatchIndex: number | null;
  selectedTile: { x: number; y: number } | null;
  tileDetail: TileDetail | null;
  npcs: NpcSummary[] | null;
  panels: { properties: boolean; npcs: boolean; tile: boolean };
};
```

Restricciones:
- no meter lógica de parsing/render en F6.
- no abrir endpoints nuevos hasta que `api-contract.md`, B5 y F1 estén actualizados.
- mantener controles como composición de contratos públicos de F3/F4/F5.
- export PNG: F6 obtiene canvas base de `canvasHandle.exportImage({ includeOverlay: true })`; F5 expone `getCanvas()` consumido internamente por F3.

Tests mínimos futuros:
- next/previous match llama `centerOn` con wrap-around y actualiza `focusedMatchIndex`.
- `zoom-to-fit` invoca `canvasHandle.zoomToFit()`.
- export PNG produce un Blob descargable y no rompe si `matches=null`.
- click en tile dispara `getTileDetail`; muestra panel; limpiarlo cierra panel y nulifica `selectedTile`.
- abrir panel NPCs por primera vez llama `getNpcs` una sola vez (cache).
- panel propiedades muestra `world_surface_y` formateado.
- error de `getTileDetail` muestra toast y deja `selectedTile` sin cambiar.

Estado: planificado, no implementado.
