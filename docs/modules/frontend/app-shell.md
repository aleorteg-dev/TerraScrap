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
- [ ] `T-01 renders UploadWorld in initial state`
- [ ] `T-02 transitions to WorldLoaded on upload`
- [ ] `T-03 shows SearchPanel and WorldCanvas after upload`
- [ ] `T-04 focuses canvas on match click`
- [ ] `T-05 closes world and resets state`
- [ ] `T-06 recovers worldId from sessionStorage on mount`
- [ ] `T-07 shows toast on API error`

## 7. Notas de implementación
- Usar `useReducer` con `State = NoWorld | { kind: "WorldLoaded"; worldId; metadata; matches }`.
- `HighlightOverlay` se renderiza como hermano del `WorldCanvas` en un contenedor con `position: relative`.
- El `ApiClient` por defecto se crea con `createApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api" })`.

## 8. Performance
- El re-render al recibir muchos matches se aísla: `HighlightOverlay` recibe `matches` por ref-like prop para evitar cascadas.

## 9. Errores
- Gestionados por un `ErrorBoundary` sencillo en la raíz.

## 10. Estado
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —