# Módulo `F4 – search-panel`

## 1. Propósito
Panel lateral con autocompletado de ítems y lista de coincidencias sobre el mundo cargado. Dispara la búsqueda en el backend y publica los resultados hacia `highlight-overlay` y `world-canvas`.

## 2. Contrato público

```ts
// src/search-panel/index.ts
export interface SearchPanelProps {
  worldId: string;
  apiClient: ApiClient;
  onResults: (r: SearchResult | null) => void;   // null = limpiar
  onMatchFocus: (match: SearchMatch) => void;     // centrar canvas
}

export const SearchPanel: React.FC<SearchPanelProps>;
```

Tipos importados desde `api-client` (solo vía `index.ts`):
- `ApiClient`, `SearchResult`, `SearchMatch`, `ItemSummary`, `ApiError`

Contrato de búsqueda:
- `SearchPanel` llama a `apiClient.searchInWorld(worldId, item.id, includeContainers)` al seleccionar un ítem.
- El default UI de `includeContainers` es `true`, alineado con `GET /api/worlds/{world_id}/search`.
- El componente expone un checkbox accesible con label "Incluir contenedores". Mientras el componente está montado, el estado del checkbox persiste entre búsquedas.
- Si el usuario desmarca el checkbox y hay un ítem seleccionado, la siguiente búsqueda se relanza con `includeContainers=false`; al volver a marcarlo, se relanza con `includeContainers=true`.

## 3. Dependencias
- `F1 api-client`.
- React 18.

## 4. No objetivos
- No pinta sobre el canvas.
- No mantiene el estado del mundo cargado.

## 5. Especificación (SDD)
- **SP-01** Input de búsqueda con autocompletado llamando `apiClient.searchItems(q)` con debounce de 200 ms.
- **SP-02** El usuario selecciona un ítem del autocompletado → se ejecuta `apiClient.searchInWorld(worldId, item.id, includeContainers)`.
- **SP-03** Mientras busca, estado visual "loading".
- **SP-04** Al recibir `SearchResult`, se muestra: contador total + lista con *(x, y, source)*; al hacer click en una fila, llama `onMatchFocus(match)`.
- **SP-05** Checkbox "Incluir contenedores" controlado, activo por defecto, pasa `include_containers` y permite excluir contenedores.
- **SP-06** Botón "Limpiar" resetea resultados y llama `onResults(null)`.
- **SP-07** Si `searchInWorld` devuelve 0 matches, mensaje explícito "Sin coincidencias".
- **SP-08** Accesibilidad: combobox ARIA para autocomplete, lista con roles correctos.

## 6. Plan de tests (TDD)
- [x] `T-01 renders search input and empty state`
- [x] `T-02 debounces autocomplete calls`
- [x] `T-03 selecting an item triggers searchInWorld`
- [x] `T-04 displays matches list with count`
- [x] `T-05 clicking a match calls onMatchFocus`
- [x] `T-06 toggling include_containers re-triggers search`
- [x] `T-06b checking include_containers again sends true on the next search`
- [x] `T-06c keeps the selected search parameters when toggling include_containers`
- [x] `T-07 shows empty result message`
- [x] `T-08 clear button resets state and calls onResults(null)`
- [x] `T-09 keyboard navigation through autocomplete list`

## 7. Notas de implementación
- Debounce sencillo con `useEffect` + `setTimeout`, o util interna (no lodash).
- La lista de matches puede ser larga (miles). Usar virtualización manual o `react-window` si es imprescindible; intentar primero sin dependencias.

## 8. Performance
- Pintar > 5000 filas → virtualizar.

## 9. Errores
- Errores de API muestran una banda de error en el panel, reintentables.

## 10. Estado
- **Versión del contrato**: v1.1
- **Último cierre**: 2026-05-01
- **Iteración actual**: iter-025
- **Decisiones**:
  - `UiState` no incluye `loading-suggest`; la sugerencia es un estado efímero del dropdown sin reflejo en UiState para evitar `setState` síncrono en el efecto (regla `react-hooks/set-state-in-effect`). La limpieza de sugerencias cuando el input se vacía se delega al handler `handleInputChange`.
  - Debounce implementado con `useEffect` + `setTimeout` + ref `isUserTypingRef` para evitar que cambios programáticos del query (selección de ítem, clear) disparen `searchItems`.
  - `includeContainers` se inicializa a `true` para respetar el default semántico del contrato API y el caso de uso principal de búsqueda en cofres.
  - Resultados > 5000 filas: pendiente de virtualización (react-window). Actualmente sin límite.
- **Deuda / follow-ups**:
  - Virtualización de lista de matches para mundos Large con miles de coincidencias (SP-08 performance). Añadir `react-window` si el benchmarking con > 5000 filas muestra drops de framerate.
  - Tests de accesibilidad con herramientas AT (axe-core) no incluidos en este ciclo.
  - `npm run lint` sigue fallando por formato Prettier en ficheros fuera de `search-panel` (`api-client`, `app-shell`, `highlight-overlay`, `setupTests`). No se corrige en esta iteración por la restricción de no tocar otros módulos frontend.

### Evolución propuesta para paridad con TerraMap

Brechas actuales:
- no hay controles de resultado anterior/siguiente como TerraMap (`previousBlock`/`nextBlock`).
- no hay acción separada de "highlight all" porque actualmente todos los resultados se resaltan siempre.

Cambios candidatos:
- añadir botones "anterior" / "siguiente" + callback `onMatchFocus` cíclico (wrap-around). Estado interno `focusedIndex: number | null` en F4; el reducer global de F6 puede observarlo si lo necesita.
- atajos de teclado activos cuando el panel está montado:
  - `n` / `ArrowDown`: siguiente match.
  - `p` / `ArrowUp`: anterior match.
  - `Enter` sobre fila: equivale a click → `onMatchFocus`.
  - `Escape`: limpia búsqueda (equivale a "Limpiar").
  - los listeners se registran en `window` con guardas para no atrapar teclas mientras el input de autocomplete tiene foco (excepto `Escape`).
- mostrar filtros por `source` (`block`, `wall`, `chest`, `object`) cuando B4 produzca `object`.
- virtualizar resultados antes de activar búsquedas con miles de coincidencias.

Contrato propuesto v2:
```ts
export interface SearchPanelProps {
  worldId: string;
  apiClient: ApiClient;
  onResults: (r: SearchResult | null) => void;
  onMatchFocus: (match: SearchMatch, index: number) => void;
}
```

Tests mínimos futuros:
- click en "siguiente" llama `onMatchFocus(matches[1], 1)`; en el último, wrap a 0.
- click en "anterior" en index 0 wrap al último.
- `n` con focus fuera del input dispara siguiente; con focus en input, no.
- `Escape` con focus en cualquier sitio limpia búsqueda y emite `onResults(null)`.
- filtro por source no muta el resultado original y actualiza `onResults`.

Estado: planificado, no implementado.
