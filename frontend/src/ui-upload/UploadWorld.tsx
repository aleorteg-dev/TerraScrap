import {
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

export const UploadWorld: FC<UploadProps> = ({
  maxSizeMb = 200,
  onUploaded,
  onError,
  apiClient,
}) => {
  const client = useMemo(() => apiClient ?? createApiClient(), [apiClient]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [validationErr, setValidationErr] = useState<ValidationKind | null>(null);
  const [uploadErr, setUploadErr] = useState<ApiError | null>(null);
  const [dragging, setDragging] = useState(false);

  const maxBytes = maxSizeMb * 1024 * 1024;

  function validate(file: File): ValidationKind | null {
    if (!file.name.endsWith('.wld')) return 'invalid_extension';
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
    setPhase('uploading');
    try {
      const result = await client.uploadWorld(file);
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
      setPhase('error');
      setUploadErr(err);
      onError?.(err);
    }
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

  return (
    <div
      className={`upload-dropzone${dragging ? ' upload-dropzone--dragging' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Drop a .wld file here or click to browse"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <p className="upload-hint" aria-hidden="true">
        Drop a <code>.wld</code> file here, or click to browse
      </p>

      <label htmlFor="wld-file-input" className="sr-only">
        Select a .wld file
      </label>
      <input
        id="wld-file-input"
        ref={inputRef}
        type="file"
        accept=".wld"
        tabIndex={-1}
        className="sr-only"
        onChange={handleChange}
        onClick={stopPropagation}
      />

      {phase === 'uploading' && (
        <div role="progressbar" aria-label="Uploading world…" className="upload-progress" />
      )}

      {validationErr !== null && (
        <p className="upload-error" role="alert">
          {validationErr === 'invalid_extension'
            ? 'Only .wld files are supported.'
            : `File is too large. Maximum size is ${maxSizeMb} MB.`}
        </p>
      )}

      {uploadErr !== null && phase === 'error' && (
        <p className="upload-error" role="alert">
          {uploadErr.message}
        </p>
      )}
    </div>
  );
};
