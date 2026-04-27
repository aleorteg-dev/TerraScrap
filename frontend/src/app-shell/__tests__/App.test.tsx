import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UploadProps } from '../../ui-upload';
import type { WorldCanvasProps } from '../../world-canvas';
import type { SearchPanelProps } from '../../search-panel';
import type { SearchMatch, WorldMetadata, ApiClient } from '../../api-client';

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock('../../ui-upload', () => ({ UploadWorld: vi.fn() }));
vi.mock('../../world-canvas', () => ({ WorldCanvas: vi.fn() }));
vi.mock('../../search-panel', () => ({ SearchPanel: vi.fn() }));
vi.mock('../../highlight-overlay', () => ({ HighlightOverlay: vi.fn() }));

import { UploadWorld } from '../../ui-upload';
import { WorldCanvas } from '../../world-canvas';
import { SearchPanel } from '../../search-panel';
import { HighlightOverlay } from '../../highlight-overlay';
import { App } from '../index';

// ── Shared fixtures ───────────────────────────────────────────────────────────
const mockMetadata: WorldMetadata = {
  name: 'Test World',
  width: 4200,
  height: 1200,
  version: 279,
  seed: '42',
  size: 'medium',
  hardmode: false,
};

const WORLD_ID = 'test-world-uuid';

const mockCenterOn = vi.fn();
const mockHandle = {
  centerOn: mockCenterOn,
  setZoom: vi.fn(),
  redraw: vi.fn(),
  screenToWorld: vi.fn(() => ({ x: 0, y: 0 })),
  worldToScreen: vi.fn(() => ({ px: 0, py: 0 })),
};

const mockDeleteWorld = vi.fn();
const mockApiClient: ApiClient = {
  uploadWorld: vi.fn(),
  getWorldMetadata: vi.fn(),
  getTilesChunk: vi.fn(),
  searchItems: vi.fn(),
  searchInWorld: vi.fn(),
  deleteWorld: mockDeleteWorld,
} as unknown as ApiClient;

// Prop-capture refs — populated by mockImplementation in beforeEach
let capturedUploadProps: UploadProps | null = null;
let capturedSearchPanelProps: SearchPanelProps | null = null;

// ── Setup / teardown ──────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  capturedUploadProps = null;
  capturedSearchPanelProps = null;
  sessionStorage.clear();

  mockDeleteWorld.mockResolvedValue(undefined);

  vi.mocked(UploadWorld).mockImplementation((props: UploadProps) => {
    capturedUploadProps = props;
    return React.createElement('div', { 'data-testid': 'upload-world' });
  });

  vi.mocked(WorldCanvas).mockImplementation(({ onReady }: WorldCanvasProps) => {
    React.useEffect(() => {
      onReady?.(mockHandle);
    }, [onReady]); // onReady = stable setCanvasHandle setter — runs once on mount
    return React.createElement('div', { 'data-testid': 'world-canvas' });
  });

  vi.mocked(SearchPanel).mockImplementation((props: SearchPanelProps) => {
    capturedSearchPanelProps = props;
    return React.createElement('div', { 'data-testid': 'search-panel' });
  });

  vi.mocked(HighlightOverlay).mockImplementation(() =>
    React.createElement('div', { 'data-testid': 'highlight-overlay' })
  );
});

afterEach(() => {
  sessionStorage.clear();
});

// ── Helper ────────────────────────────────────────────────────────────────────
function triggerUpload() {
  act(() => {
    capturedUploadProps?.onUploaded({ worldId: WORLD_ID, metadata: mockMetadata });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('App', () => {
  it('T-01 renders UploadWorld in initial state', () => {
    render(<App apiClient={mockApiClient} />);

    expect(screen.getByTestId('upload-world')).toBeInTheDocument();
    expect(screen.queryByTestId('world-canvas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-panel')).not.toBeInTheDocument();
  });

  it('T-02 transitions to WorldLoaded on upload', () => {
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    expect(screen.getByTestId('world-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('upload-world')).not.toBeInTheDocument();
  });

  it('T-03 shows SearchPanel and WorldCanvas after upload', () => {
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    expect(screen.getByTestId('world-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('search-panel')).toBeInTheDocument();
    expect(screen.getByTestId('highlight-overlay')).toBeInTheDocument();
  });

  it('T-04 focuses canvas on match click', async () => {
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    // Wait for canvasHandle to propagate (onReady effect + re-render)
    await waitFor(() => expect(capturedSearchPanelProps).not.toBeNull());

    const match: SearchMatch = { x: 100, y: 200, source: 'chest' };
    act(() => {
      capturedSearchPanelProps?.onMatchFocus(match);
    });

    expect(mockCenterOn).toHaveBeenCalledWith(100, 200);
  });

  it('T-05 closes world and resets state', async () => {
    const user = userEvent.setup();
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    const closeBtn = screen.getByRole('button', { name: /cerrar mundo/i });
    await user.click(closeBtn);

    expect(mockDeleteWorld).toHaveBeenCalledWith(WORLD_ID);
    expect(screen.getByTestId('upload-world')).toBeInTheDocument();
    expect(screen.queryByTestId('world-canvas')).not.toBeInTheDocument();
  });

  it('T-06 recovers worldId from sessionStorage on mount', () => {
    sessionStorage.setItem('terra_world_id', WORLD_ID);
    sessionStorage.setItem('terra_world_metadata', JSON.stringify(mockMetadata));

    render(<App apiClient={mockApiClient} />);

    expect(screen.getByTestId('world-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('upload-world')).not.toBeInTheDocument();
  });

  it('T-07 shows toast on API error', async () => {
    const user = userEvent.setup();
    mockDeleteWorld.mockRejectedValue(new Error('Server unavailable'));

    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    const closeBtn = screen.getByRole('button', { name: /cerrar mundo/i });
    await user.click(closeBtn);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/server unavailable/i));
  });
});
