import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UploadWorld } from '../UploadWorld';
import { ApiError } from '../../api-client';
import type { ApiClient, WorldMetadata } from '../../api-client';

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

  it('rejects non-.wld file with error message', async () => {
    const { client, uploadWorld } = makeApiClient();
    render(<UploadWorld onUploaded={vi.fn()} apiClient={client} />);
    const input = screen.getByLabelText(/select a \.wld file/i);
    fireEvent.change(input, { target: { files: [makeFile('map.txt', 1024)] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/\.wld/i);
    expect(uploadWorld).not.toHaveBeenCalled();
  });

  it('rejects file above maxSizeMb', async () => {
    const { client, uploadWorld } = makeApiClient();
    render(<UploadWorld onUploaded={vi.fn()} apiClient={client} maxSizeMb={1} />);
    const input = screen.getByLabelText(/select a \.wld file/i);
    fireEvent.change(input, { target: { files: [makeFile('world.wld', 2 * 1024 * 1024)] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/too large|1 MB/i);
    expect(uploadWorld).not.toHaveBeenCalled();
  });

  it('calls onUploaded on 200 response', async () => {
    const { client } = makeApiClient();
    const onUploaded = vi.fn();
    render(<UploadWorld onUploaded={onUploaded} apiClient={client} />);
    const input = screen.getByLabelText(/select a \.wld file/i);
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
    const input = screen.getByLabelText(/select a \.wld file/i);
    fireEvent.change(input, { target: { files: [makeFile('world.wld', 1024)] } });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
  });

  it('shows loading state while uploading', async () => {
    const neverResolve = new Promise<{ worldId: string; metadata: WorldMetadata }>(() => {});
    const { client } = makeApiClient(vi.fn().mockReturnValue(neverResolve));
    render(<UploadWorld onUploaded={vi.fn()} apiClient={client} />);
    const input = screen.getByLabelText(/select a \.wld file/i);
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
    expect(screen.getByLabelText(/select a \.wld file/i)).toBeInTheDocument();
  });
});
