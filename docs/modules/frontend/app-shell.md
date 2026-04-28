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
- **SP-07** Layout responsivo: canvas arriba (flex 1), panel lateral derecho (320 px), upload centrado cuando no hay mundo.
- **SP-08** Persiste `worldId` en `sessionStorage` para recuperar la sesión al recargar.

## 6. Plan de tests (TDD)
- [x] `T-01 renders UploadWorld in initial state`
- [x] `T-02 transitions to WorldLoaded on upload`
- [x] `T-03 shows SearchPanel and WorldCanvas after upload`
- [x] `T-04 focuses canvas on match click`
- [x] `T-05 closes world and resets state`
- [x] `T-06 recovers worldId from sessionStorage on mount`
- [x] `T-07 shows toast on API error`

## 7. Notas de implementación
- Usar `useReducer` con `State = NoWorld | { kind: "WorldLoaded"; worldId; metadata; matches }`.
- `HighlightOverlay` se renderiza como hermano del `WorldCanvas` en un contenedor con `position: relative`.
- El `ApiClient` por defecto se crea con `createApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api" })`.

## 8. Performance
- El re-render al recibir muchos matches se aísla: `HighlightOverlay` recibe `matches` por ref-like prop para evitar cascadas.

## 9. Errores
- Gestionados por un `ErrorBoundary` sencillo en la raíz.

## 10. Estado
- **Versión del contrato**: v1.0
- **Último cierre**: 2026-04-27 (iter-012)
- **Iteración actual**: cerrada

### Decisiones tomadas
- `useReducer` con `AppState = NoWorld | WorldLoaded` (tipo discriminado).
- `canvasHandle` en `useState` (no `useRef`) para que `handleMatchFocus` reciba el valor actual.
- `sessionStorage` persiste `terra_world_id` + `terra_world_metadata`; se recupera en `readSessionState` (lazy init de `useReducer`).
- `deleteWorld` falla silenciosamente: se muestra toast pero se cierra la sesión local igualmente (sesiones en memoria, pueden haber expirado).
- `ErrorBoundary` clase mínima en el mismo fichero (no necesita módulo propio).
- `src/App.tsx` re-exporta desde `./app-shell` para mantener compatibilidad con cualquier import legacy.

### Deuda / follow-ups
- Smoke test manual pendiente (requiere backend vivo con `.wld` real). Anotar resultado aquí tras realizarlo.
- P1 deployment-docker: empaquetar frontend con nginx.

### Evolución propuesta para paridad con TerraMap

F6 debe coordinar los controles globales, porque es el único módulo que conoce canvas, búsqueda y API.

Controles candidatos:
- barra de herramientas con cerrar mundo, zoom-to-fit, limpiar resaltado, exportar PNG, resultado anterior/siguiente.
- panel de propiedades del mundo usando metadata enriquecida.
- panel/lista de NPCs cuando B5 exponga endpoint.
- panel de información del tile seleccionado usando un endpoint de inspección o datos del chunk enriquecido.
- estado `selectedTile` y `focusedMatchIndex` en el reducer.

Restricciones:
- no meter lógica de parsing/render en F6.
- no abrir endpoints nuevos hasta que `api-contract.md`, B5 y F1 estén actualizados.
- mantener controles como composición de contratos públicos de F3/F4/F5.

Tests mínimos futuros:
- next/previous match llama `centerOn` con wrap-around.
- zoom-to-fit invoca el handle de F3.
- export PNG invoca la API del canvas/overlay sin romper si no hay matches.
- seleccionar tile muestra detalle recibido del cliente API.
