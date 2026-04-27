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

## 3. Dependencias
- `F1 api-client`.
- React 18.

## 4. No objetivos
- No pinta sobre el canvas.
- No mantiene el estado del mundo cargado.

## 5. Especificación (SDD)
- **SP-01** Input de búsqueda con autocompletado llamando `apiClient.searchItems(q)` con debounce de 200 ms.
- **SP-02** El usuario selecciona un ítem del autocompletado → se ejecuta `apiClient.searchInWorld(worldId, item.id)`.
- **SP-03** Mientras busca, estado visual "loading".
- **SP-04** Al recibir `SearchResult`, se muestra: contador total + lista con *(x, y, source)*; al hacer click en una fila, llama `onMatchFocus(match)`.
- **SP-05** Checkbox "Incluir contenedores" controlado, pasa `include_containers`.
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
- **Versión del contrato**: v1
- **Último cierre**: 2026-04-27
- **Iteración actual**: iter-010
- **Decisiones**:
  - `UiState` no incluye `loading-suggest`; la sugerencia es un estado efímero del dropdown sin reflejo en UiState para evitar `setState` síncrono en el efecto (regla `react-hooks/set-state-in-effect`). La limpieza de sugerencias cuando el input se vacía se delega al handler `handleInputChange`.
  - Debounce implementado con `useEffect` + `setTimeout` + ref `isUserTypingRef` para evitar que cambios programáticos del query (selección de ítem, clear) disparen `searchItems`.
  - Resultados > 5000 filas: pendiente de virtualización (react-window). Actualmente sin límite.
- **Deuda / follow-ups**:
  - Virtualización de lista de matches para mundos Large con miles de coincidencias (SP-08 performance). Añadir `react-window` si el benchmarking con > 5000 filas muestra drops de framerate.
  - Tests de accesibilidad con herramientas AT (axe-core) no incluidos en este ciclo.