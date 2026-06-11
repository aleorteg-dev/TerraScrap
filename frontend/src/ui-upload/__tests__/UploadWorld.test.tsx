import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { UploadWorld } from '../UploadWorld';
import { ApiError } from '../../api-client';
import type { ApiClient, UploadOptions, WorldMetadata } from '../../api-client';

const mockMeta: WorldMetadata = {
  name: 'Test World',
  width: 4200,
  height: 1200,
  version: 279,
  seed: '12345',
  size: 'medium',
  hardmode: false,
};

function makeFile(name: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type: 'application/octet-stream' });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

const fileInputLabel = /selecciona un mundo de terraria/i;

function makeApiClient(uploadOverride?: ReturnType<typeof vi.fn>): {
  client: ApiClient;
  uploadWorld: ReturnType<typeof vi.fn>;
} {
  const uploadWorld =
    uploadOverride ?? vi.fn().mockResolvedValue({ worldId: 'w1', metadata: mockMeta });
  return {
    uploadWorld,
    client: {
      uploadWorld,
      getWorldMetadata: vi.fn(),
      getTilesChunk: vi.fn(),
      searchItems: vi.fn(),
      searchInWorld: vi.fn(),
      deleteWorld: vi.fn(),
    } as unknown as ApiClient,
  };
}

describe('UploadWorld', () => {
  it('renders dropzone and file input', () => {
    render(<UploadWorld onUploaded={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('rejects non-.wld file with a friendly error message', async () => {
    const { client, uploadWorld } = makeApiClient();
    render(<UploadWorld onUploaded={vi.fn()} apiClient={client} />);
    const input = screen.getByLabelText(fileInputLabel);
    fireEvent.change(input, { target: { files: [makeFile('map.txt', 1024)] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/mundo de terraria/i);
    expect(uploadWorld).not.toHaveBeenCalled();
  });

  it('rejects file above maxSizeMb with a friendly message', async () => {
    const { client, uploadWorld } = makeApiClient();
    render(<UploadWorld onUploaded={vi.fn()} apiClient={client} maxSizeMb={1} />);
    const input = screen.getByLabelText(fileInputLabel);
    fireEvent.change(input, { target: { files: [makeFile('world.wld', 2 * 1024 * 1024)] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/demasiado grande/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/1 MB|max/i);
    expect(uploadWorld).not.toHaveBeenCalled();
  });

  it('calls onUploaded on 200 response', async () => {
    const { client } = makeApiClient();
    const onUploaded = vi.fn();
    render(<UploadWorld onUploaded={onUploaded} apiClient={client} />);
    const input = screen.getByLabelText(fileInputLabel);
    fireEvent.change(input, { target: { files: [makeFile('world.wld', 1024)] } });
    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith({ worldId: 'w1', metadata: mockMeta })
    );
  });

  it('calls onError on 400 response', async () => {
    const error = new ApiError('parse_error', 400, 'Parse failed');
    const { client } = makeApiClient(vi.fn().mockRejectedValue(error));
    const onError = vi.fn();
    render(<UploadWorld onUploaded={vi.fn()} onError={onError} apiClient={client} />);
    const input = screen.getByLabelText(fileInputLabel);
    fireEvent.change(input, { target: { files: [makeFile('world.wld', 1024)] } });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
  });

  it('shows loading state while uploading', async () => {
    const neverResolve = new Promise<{ worldId: string; metadata: WorldMetadata }>(() => {});
    const { client } = makeApiClient(vi.fn().mockReturnValue(neverResolve));
    render(<UploadWorld onUploaded={vi.fn()} apiClient={client} />);
    const input = screen.getByLabelText(fileInputLabel);
    fireEvent.change(input, { target: { files: [makeFile('world.wld', 1024)] } });
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument());
  });

  it('allows selecting file via drag and drop', async () => {
    const { client } = makeApiClient();
    const onUploaded = vi.fn();
    render(<UploadWorld onUploaded={onUploaded} apiClient={client} />);
    const dropzone = screen.getByRole('button');
    const file = makeFile('world.wld', 1024);
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] } as unknown as DataTransfer,
    });
    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith({ worldId: 'w1', metadata: mockMeta })
    );
  });

  it('input has accessible label', () => {
    render(<UploadWorld onUploaded={vi.fn()} />);
    expect(screen.getByLabelText(fileInputLabel)).toBeInTheDocument();
  });

  it('two instances render distinct input IDs', () => {
    const { container: c1 } = render(<UploadWorld onUploaded={vi.fn()} />);
    const { container: c2 } = render(<UploadWorld onUploaded={vi.fn()} />);
    const id1 = c1.querySelector('input[type="file"]')?.id;
    const id2 = c2.querySelector('input[type="file"]')?.id;
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('progressbar reflects real upload percentage via onProgress', async () => {
    let capturedOnProgress: ((pct: number) => void) | undefined;
    let resolveUpload!: (v: { worldId: string; metadata: WorldMetadata }) => void;
    const uploadWorld = vi.fn().mockImplementation((_file: File, opts?: UploadOptions) => {
      capturedOnProgress = opts?.onProgress;
      return new Promise<{ worldId: string; metadata: WorldMetadata }>((r) => {
        resolveUpload = r;
      });
    });
    const { client } = makeApiClient(uploadWorld);
    render(<UploadWorld onUploaded={vi.fn()} apiClient={client} />);
    const input = screen.getByLabelText(fileInputLabel);
    fireEvent.change(input, { target: { files: [makeFile('world.wld', 1024)] } });

    await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument());

    act(() => {
      capturedOnProgress!(60);
    });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');

    act(() => {
      resolveUpload({ worldId: 'w1', metadata: mockMeta });
    });
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
  });

  it('accepts .wld file with uppercase extension (WORLD.WLD)', async () => {
    const { client, uploadWorld } = makeApiClient();
    render(<UploadWorld onUploaded={vi.fn()} apiClient={client} />);
    const input = screen.getByLabelText(fileInputLabel);
    fireEvent.change(input, { target: { files: [makeFile('WORLD.WLD', 1024)] } });
    await waitFor(() => expect(uploadWorld).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects file with non-.wld extension (world.txt)', async () => {
    const { client, uploadWorld } = makeApiClient();
    render(<UploadWorld onUploaded={vi.fn()} apiClient={client} />);
    const input = screen.getByLabelText(fileInputLabel);
    fireEvent.change(input, { target: { files: [makeFile('world.txt', 1024)] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/mundo de terraria/i);
    expect(uploadWorld).not.toHaveBeenCalled();
  });

  it('error state shows a friendly message and retry button resets to idle', async () => {
    const error = new ApiError('network_error', 0, 'Network failed');
    const { client } = makeApiClient(vi.fn().mockRejectedValue(error));
    render(<UploadWorld onUploaded={vi.fn()} apiClient={client} />);
    const input = screen.getByLabelText(fileInputLabel);
    fireEvent.change(input, { target: { files: [makeFile('world.wld', 1024)] } });

    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo conectar/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/network_error|network failed/i);

    const retry = screen.getByRole('button', { name: /intentar de nuevo/i });
    fireEvent.click(retry);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
