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
- [ ] `T-01 renders search input and empty state`
- [ ] `T-02 debounces autocomplete calls`
- [ ] `T-03 selecting an item triggers searchInWorld`
- [ ] `T-04 displays matches list with count`
- [ ] `T-05 clicking a match calls onMatchFocus`
- [ ] `T-06 toggling include_containers re-triggers search`
- [ ] `T-07 shows empty result message`
- [ ] `T-08 clear button resets state and calls onResults(null)`
- [ ] `T-09 keyboard navigation through autocomplete list`

## 7. Notas de implementación
- Debounce sencillo con `useEffect` + `setTimeout`, o util interna (no lodash).
- La lista de matches puede ser larga (miles). Usar virtualización manual o `react-window` si es imprescindible; intentar primero sin dependencias.

## 8. Performance
- Pintar > 5000 filas → virtualizar.

## 9. Errores
- Errores de API muestran una banda de error en el panel, reintentables.

## 10. Estado
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —