import {
  useId,
  useRef,
  useState,
  useMemo,
  type FC,
  type KeyboardEvent,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
} from 'react';
import { ApiError, createApiClient } from '../api-client';
import type { ApiClient, WorldMetadata } from '../api-client';
import './UploadWorld.css';

export interface UploadResult {
  worldId: string;
  metadata: WorldMetadata;
}

export interface UploadProps {
  maxSizeMb?: number;
  onUploaded: (r: UploadResult) => void;
  onError?: (e: ApiError) => void;
  apiClient?: ApiClient;
}

type Phase = 'idle' | 'uploading' | 'success' | 'error';
type ValidationKind = 'invalid_extension' | 'file_too_large';

function friendlyUploadError(err: ApiError): string {
  switch (err.code) {
    case 'upload_too_large':
      return 'Ese mundo es demasiado grande para subirlo aquí.';
    case 'invalid_wld':
      return 'No pudimos leer ese mundo. Prueba con otro archivo de Terraria.';
    case 'unsupported_version':
    case 'api_version_mismatch':
      return 'Ese mundo no se puede abrir todavía en TerraScrap.';
    case 'network_error':
      return 'No se pudo conectar. Revisa la conexión e inténtalo de nuevo.';
    default:
      return 'No pudimos subir el mundo. Inténtalo de nuevo.';
  }
}

export const UploadWorld: FC<UploadProps> = ({
  maxSizeMb = 200,
  onUploaded,
  onError,
  apiClient,
}) => {
  const client = useMemo(() => apiClient ?? createApiClient(), [apiClient]);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const [phase, setPhase] = useState<Phase>('idle');
  const [validationErr, setValidationErr] = useState<ValidationKind | null>(null);
  const [uploadErr, setUploadErr] = useState<ApiError | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const maxBytes = maxSizeMb * 1024 * 1024;

  function validate(file: File): ValidationKind | null {
    if (!file.name.toLowerCase().endsWith('.wld')) return 'invalid_extension';
    if (file.size > maxBytes) return 'file_too_large';
    return null;
  }

  async function processFile(file: File): Promise<void> {
    const vErr = validate(file);
    if (vErr !== null) {
      setValidationErr(vErr);
      setUploadErr(null);
      setPhase('idle');
      return;
    }
    setValidationErr(null);
    setUploadErr(null);
    setProgress(0);
    setPhase('uploading');
    try {
      const result = await client.uploadWorld(file, { onProgress: setProgress });
      setProgress(null);
      setPhase('success');
      onUploaded({ worldId: result.worldId, metadata: result.metadata });
    } catch (caught) {
      const err =
        caught instanceof ApiError
          ? caught
          : new ApiError(
              'unknown_error',
              0,
              caught instanceof Error ? caught.message : 'Unknown error'
            );
      setProgress(null);
      setPhase('error');
      setUploadErr(err);
      onError?.(err);
    }
  }

  function handleRetry(): void {
    setPhase('idle');
    setUploadErr(null);
    setProgress(null);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file !== undefined) void processFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file !== undefined) void processFile(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(): void {
    setDragging(false);
  }

  function handleClick(): void {
    inputRef.current?.click();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  function stopPropagation(e: MouseEvent<HTMLInputElement>): void {
    e.stopPropagation();
  }

  const classes = ['dropzone'];
  if (dragging) classes.push('drag');
  if (phase === 'uploading') classes.push('loading');

  return (
    <div
      className={classes.join(' ')}
      role="button"
      tabIndex={0}
      aria-label="Suelta aquí tu mundo de Terraria o haz clic para buscarlo"
      aria-busy={phase === 'uploading'}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="dropzone-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 4v12m0 0l-5-5m5 5l5-5M4 20h16" />
        </svg>
      </div>
      <h2>Suelta tu mundo</h2>
      <p>o haz clic para buscarlo</p>

      <label htmlFor={inputId} className="sr-only">
        Selecciona un mundo de Terraria
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept=".wld"
        aria-label="Selecciona un mundo de Terraria"
        tabIndex={-1}
        className="sr-only"
        onChange={handleChange}
        onClick={stopPropagation}
      />

      <span className="dropzone-cta" aria-hidden="true">
        BUSCAR ARCHIVO
      </span>

      {phase === 'uploading' && (
        <div
          role="progressbar"
          aria-label="Subiendo mundo"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress !== null ? progress : undefined}
          className="upload-bar"
        >
          <span style={{ width: `${progress ?? 0}%` }} aria-hidden="true" />
        </div>
      )}

      {validationErr !== null && (
        <p className="upload-error" role="alert">
          {validationErr === 'invalid_extension'
            ? 'Elige un archivo de mundo de Terraria.'
            : 'Ese mundo es demasiado grande para subirlo aquí.'}
        </p>
      )}

      {uploadErr !== null && phase === 'error' && (
        <>
          <p className="upload-error" role="alert">
            {friendlyUploadError(uploadErr)}
          </p>
          <button type="button" className="upload-retry" onClick={handleRetry}>
            Intentar de nuevo
          </button>
        </>
      )}
    </div>
  );
};
