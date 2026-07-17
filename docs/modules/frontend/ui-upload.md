# Módulo `F2 – ui-upload`

## 1. Propósito
Componente React que permite al usuario seleccionar un fichero `.wld` y subirlo al backend. Muestra validación previa (tamaño, extensión) y progreso. Al terminar, emite el `worldId` + `metadata` al exterior.

## 2. Contrato público

```ts
// src/ui-upload/index.ts
export interface UploadResult {
  worldId: string;
  metadata: WorldMetadata;
}

export interface UploadProps {
  maxSizeMb?: number;            // default 200
  onUploaded: (r: UploadResult) => void;
  onError?: (e: ApiError) => void;
  apiClient?: ApiClient;         // inyectable para tests
}

export const UploadWorld: React.FC<UploadProps>;
```

## 3. Dependencias
- `F1 api-client` (tipos + cliente).
- React 19.
- No depende de librerías pesadas de UI; CSS propio del módulo.

## 4. No objetivos
- No renderiza el canvas.
- No gestiona el estado global de la app (eso es `app-shell`).

## 5. Especificación (SDD)
- **SP-01** Muestra un dropzone + input `<input type="file" accept=".wld">`.
- **SP-02** Rechaza ficheros > `maxSizeMb` con mensaje claro, sin llamar a la API.
- **SP-03** Rechaza ficheros con extensión distinta a `.wld`. La comparación es case-insensitive (`WORLD.WLD` se acepta).
- **SP-04** Durante upload, muestra barra de progreso o indeterminada.
- **SP-05** Al 200, llama `onUploaded({worldId, metadata})`.
- **SP-06** Al error, muestra mensaje y llama `onError?` si se proporcionó.
- **SP-07** Soporta drag & drop y click para seleccionar.
- **SP-08** Accesible: rol `button`, focus ring, ARIA labels.
- **SP-09** (IT-12, E21) `api_version_mismatch` tiene mensaje propio ("La aplicación necesita actualizarse. Recarga la página e inténtalo de nuevo.") separado de `unsupported_version`: el problema es de despliegue front/back, no del fichero del usuario.

## 6. Plan de tests (TDD)
Vitest + Testing Library.

- [x] `T-01 renders dropzone and file input`
- [x] `T-02 rejects non-.wld file with error message`
- [x] `T-03 rejects file above maxSizeMb`
- [x] `T-04 calls onUploaded on 200 response` (apiClient mockeado)
- [x] `T-05 calls onError on 400 response`
- [x] `T-06 shows loading state while uploading`
- [x] `T-07 allows selecting file via drag and drop` (fireEvent drop)
- [x] `T-08 input has accessible label`
- [x] `T-09 two instances render distinct input IDs` (useId)
- [x] `T-10 progressbar reflects real upload percentage via onProgress`
- [x] `T-11 error state shows error code and retry button resets to idle`
- [x] `T-12 accepts .wld file with uppercase extension (WORLD.WLD)`
- [x] `T-13 rejects file with non-.wld extension (world.txt)`
- [x] `T-14 api_version_mismatch shows its own update message, not the file one (E21)` (IT-12)

## 7. Notas de implementación
- Estado local con `useState`/`useReducer` para el flujo `idle → validating → uploading → success|error`.
- Evitar librerías externas; un dropzone en 50 líneas es suficiente.
- Para el test de drag & drop, `fireEvent.drop(dropzone, { dataTransfer: { files: [file] } })`.

## 8. Performance
- No mantener el `File` en memoria tras el upload; liberar referencia.

## 9. Errores
- Delegados al `onError`. Mensajes de validación locales solo para `file_too_large` / `invalid_extension`.

## 10. Estado
- **Versión del contrato**: v1.0 (IT-12 no cambia el contrato)
- **Último cierre**: 2026-07-17 — IT-12 (PLAN_REMEDIACION E21)
- **Iteración actual**: cerrada
- **Cambios IT-12**: `friendlyUploadError` separa `api_version_mismatch` de
  `unsupported_version` con mensaje propio que pide recargar la aplicación
  (SP-09): el desajuste de versión de API es un problema de despliegue
  front/back, no del fichero del usuario.
- **Decisiones tomadas**:
  - Input oculto con `.sr-only` (no `display:none`) para que RTL y lectores de pantalla lo encuentren vía `<label htmlFor>`.
  - `apiClient` inyectable por prop; si no se pasa, crea uno con `createApiClient()` vía `useMemo`.
  - Estado manejado con `useState` (`phase`, `validationErr`, `uploadErr`, `dragging`, `progress`).
  - Errores de validación locales (`invalid_extension`, `file_too_large`) no llaman a la API ni disparan `onError`.
  - `stopPropagation` en el `onClick` del `<input>` para evitar doble apertura del diálogo de fichero.
  - `useId()` para inputId: IDs únicos por instancia, seguro en múltiples renders.
  - `client.uploadWorld(file, { onProgress: setProgress })` para progreso real vía XHR; `progress` null = indeterminado.
  - Progressbar: `aria-valuenow` presente solo cuando `progress !== null`; omitido → indeterminado.
  - Dropzone: `aria-busy={phase === 'uploading'}`.
  - Error muestra `[code] message` + botón "Try again" que resetea a idle.
  - `coverage/` añadido a `globalIgnores` en `eslint.config.js` (archivos generados por Istanbul).
- **Deuda / follow-ups**:
  - Ninguna.
