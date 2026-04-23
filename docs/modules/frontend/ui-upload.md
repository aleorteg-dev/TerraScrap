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
- React 18.
- No depende de librerías pesadas de UI; CSS propio del módulo.

## 4. No objetivos
- No renderiza el canvas.
- No gestiona el estado global de la app (eso es `app-shell`).

## 5. Especificación (SDD)
- **SP-01** Muestra un dropzone + input `<input type="file" accept=".wld">`.
- **SP-02** Rechaza ficheros > `maxSizeMb` con mensaje claro, sin llamar a la API.
- **SP-03** Rechaza ficheros con extensión distinta a `.wld`.
- **SP-04** Durante upload, muestra barra de progreso o indeterminada.
- **SP-05** Al 200, llama `onUploaded({worldId, metadata})`.
- **SP-06** Al error, muestra mensaje y llama `onError?` si se proporcionó.
- **SP-07** Soporta drag & drop y click para seleccionar.
- **SP-08** Accesible: rol `button`, focus ring, ARIA labels.

## 6. Plan de tests (TDD)
Vitest + Testing Library.

- [ ] `T-01 renders dropzone and file input`
- [ ] `T-02 rejects non-.wld file with error message`
- [ ] `T-03 rejects file above maxSizeMb`
- [ ] `T-04 calls onUploaded on 200 response` (apiClient mockeado)
- [ ] `T-05 calls onError on 400 response`
- [ ] `T-06 shows loading state while uploading`
- [ ] `T-07 allows selecting file via drag and drop` (fireEvent drop)
- [ ] `T-08 input has accessible label`

## 7. Notas de implementación
- Estado local con `useState`/`useReducer` para el flujo `idle → validating → uploading → success|error`.
- Evitar librerías externas; un dropzone en 50 líneas es suficiente.
- Para el test de drag & drop, `fireEvent.drop(dropzone, { dataTransfer: { files: [file] } })`.

## 8. Performance
- No mantener el `File` en memoria tras el upload; liberar referencia.

## 9. Errores
- Delegados al `onError`. Mensajes de validación locales solo para `file_too_large` / `invalid_extension`.

## 10. Estado
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —