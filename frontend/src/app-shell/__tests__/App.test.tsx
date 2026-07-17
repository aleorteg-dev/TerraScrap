import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UploadProps } from '../../ui-upload';
import type { WorldCanvasProps } from '../../world-canvas';
import type { SearchPanelProps } from '../../search-panel';
import type { SearchMatch, WorldMetadata, TileDetail, Npc, ApiClient } from '../../api-client';
import { WorldNotFoundError } from '../../api-client';

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock('../../ui-upload', () => ({ UploadWorld: vi.fn() }));
// Se conserva el módulo real (ZOOM_LIMITS lo consume appState) y solo se
// mockea el componente.
vi.mock('../../world-canvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../world-canvas')>()),
  WorldCanvas: vi.fn(),
}));
vi.mock('../../search-panel', () => ({ SearchPanel: vi.fn() }));
vi.mock('../../highlight-overlay', () => ({ HighlightOverlay: vi.fn() }));

import { UploadWorld } from '../../ui-upload';
import { WorldCanvas, ZOOM_LIMITS } from '../../world-canvas';
import { SearchPanel } from '../../search-panel';
import { HighlightOverlay } from '../../highlight-overlay';
import { App } from '../index';

const indexCss = readFileSync(join(cwd(), 'src/index.css'), 'utf8');
const appCss = readFileSync(join(cwd(), 'src/app-shell/App.css'), 'utf8');

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

const mockTileDetail: TileDetail = {
  x: 10,
  y: 20,
  tile_id: 1,
  wall_id: null,
  liquid_type: 'none',
  liquid_amount: 0,
  frame_x: null,
  frame_y: null,
  chest_id: null,
  sign_id: null,
  tile_entity_id: null,
};

const mockNpcs: Npc[] = [
  { id: 1, name: 'Guide', type: 'town', x: 150, y: 300 },
  { id: 2, name: 'Merchant', type: 'town', x: 200, y: 250 },
];

const mockCenterOn = vi.fn();
const mockSetZoom = vi.fn();
const mockZoomToFit = vi.fn();
const mockExportToPng = vi.fn();
const mockHandle = {
  centerOn: mockCenterOn,
  setZoom: mockSetZoom,
  zoomToFit: mockZoomToFit,
  redraw: vi.fn(),
  screenToWorld: vi.fn(() => ({ x: 0, y: 0 })),
  worldToScreen: vi.fn(() => ({ px: 0, py: 0 })),
  exportToPng: mockExportToPng,
};

const mockDeleteWorld = vi.fn();
const mockGetTileDetail = vi.fn();
const mockListNpcs = vi.fn();
const mockGetWorldMetadata = vi.fn();

const mockApiClient: ApiClient = {
  uploadWorld: vi.fn(),
  getWorldMetadata: mockGetWorldMetadata,
  getTilesChunk: vi.fn(),
  getTileDetail: mockGetTileDetail,
  listNpcs: mockListNpcs,
  searchItems: vi.fn(),
  getItem: vi.fn(),
  searchInWorld: vi.fn(),
  deleteWorld: mockDeleteWorld,
} as unknown as ApiClient;

// Prop-capture refs — populated by mockImplementation in beforeEach
let capturedUploadProps: UploadProps | null = null;
let capturedSearchPanelProps: SearchPanelProps | null = null;
let capturedCanvasProps: WorldCanvasProps | null = null;
let originalClientWidthDescriptor: PropertyDescriptor | undefined;
let injectedStyle: HTMLStyleElement | null = null;

function parsePixelValue(value: string): number | null {
  if (!value.endsWith('px')) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rootClientWidth(root: HTMLElement): number {
  const style = window.getComputedStyle(root);
  const declaredWidth = parsePixelValue(style.width) ?? window.innerWidth;

  const maxWidth =
    style.maxWidth === 'none'
      ? Number.POSITIVE_INFINITY
      : style.maxWidth === '100%'
        ? window.innerWidth
        : (parsePixelValue(style.maxWidth) ?? Number.POSITIVE_INFINITY);

  return Math.round(Math.min(declaredWidth, maxWidth));
}

function measuredClientWidth(element: HTMLElement): number {
  if (element.id === 'root') return rootClientWidth(element);

  if (element.classList.contains('app-sidebar')) {
    return parsePixelValue(window.getComputedStyle(element).width) ?? 0;
  }

  if (element.classList.contains('app-canvas-container')) {
    const parentWidth = element.parentElement?.clientWidth ?? window.innerWidth;
    const panel = element.parentElement?.querySelector<HTMLElement>('.app-sidebar');
    const panelWidth = panel?.clientWidth ?? 0;
    return Math.max(parentWidth - panelWidth, 0);
  }

  return element.parentElement?.clientWidth ?? window.innerWidth;
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });

  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCssRule(css: string, selector: string): string {
  const rulePattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{[^{}]*\\}`, 'm');
  const match = css.match(rulePattern);
  if (match === null) throw new Error(`Missing CSS rule for ${selector}`);

  return match[0];
}

function layoutCssForJsdom(): string {
  return [
    extractCssRule(indexCss, '#root'),
    extractCssRule(indexCss, 'body'),
    extractCssRule(appCss, '.app'),
    extractCssRule(appCss, '.app-main'),
    extractCssRule(appCss, '.app-canvas-container'),
    extractCssRule(appCss, '.app-sidebar'),
  ].join('\n');
}

// ── Setup / teardown ──────────────────────────────────────────────────────────
beforeAll(() => {
  injectedStyle = document.createElement('style');
  injectedStyle.textContent = layoutCssForJsdom();
  document.head.append(injectedStyle);

  originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientWidth'
  );

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return measuredClientWidth(this as HTMLElement);
    },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  capturedUploadProps = null;
  capturedSearchPanelProps = null;
  capturedCanvasProps = null;
  sessionStorage.clear();
  setViewportWidth(1440);

  mockDeleteWorld.mockResolvedValue(undefined);
  mockGetWorldMetadata.mockResolvedValue(mockMetadata);
  // Never resolves by default — prevents unexpected state updates in other tests
  mockGetTileDetail.mockReturnValue(new Promise<TileDetail>(() => {}));
  mockListNpcs.mockReturnValue(new Promise<Npc[]>(() => {}));
  // Como el canvas real: todo cambio de zoom interno notifica onZoomChange
  // (IT-07); el estado de app-shell es un espejo de esa notificación (IT-09).
  mockSetZoom.mockImplementation((zoom: number) => {
    act(() => {
      capturedCanvasProps?.onZoomChange?.(zoom);
    });
  });
  mockZoomToFit.mockImplementation(() => {
    act(() => {
      capturedCanvasProps?.onZoomChange?.(0.5);
    });
    return 0.5;
  });
  mockExportToPng.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

  vi.mocked(UploadWorld).mockImplementation((props: UploadProps) => {
    capturedUploadProps = props;
    return React.createElement('div', { 'data-testid': 'upload-world' });
  });

  vi.mocked(WorldCanvas).mockImplementation((props: WorldCanvasProps) => {
    capturedCanvasProps = props;
    const { onReady } = props;
    React.useEffect(() => {
      onReady?.(mockHandle);
    }, [onReady]);
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

afterAll(() => {
  injectedStyle?.remove();
  injectedStyle = null;

  if (originalClientWidthDescriptor === undefined) {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    return;
  }

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidthDescriptor);
});

// ── Helper ────────────────────────────────────────────────────────────────────
function triggerUpload() {
  act(() => {
    capturedUploadProps?.onUploaded({ worldId: WORLD_ID, metadata: mockMetadata });
  });
}

function renderAppInRoot(): HTMLElement {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);

  render(<App apiClient={mockApiClient} />, { container: root });

  return root;
}

async function renderLoadedAppInRoot(): Promise<HTMLElement> {
  sessionStorage.setItem('terra_world_id', WORLD_ID);
  mockGetWorldMetadata.mockResolvedValue(mockMetadata);

  const root = renderAppInRoot();
  await waitFor(() => expect(screen.getByTestId('world-canvas')).toBeInTheDocument());
  return root;
}

// ── Tests: existing ───────────────────────────────────────────────────────────
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

    await waitFor(() => expect(capturedSearchPanelProps).not.toBeNull());

    const match: SearchMatch = { x: 100, y: 200, source: 'chest' };
    act(() => {
      capturedSearchPanelProps?.onMatchFocus(match, 0);
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

  it('T-06 recovers worldId from sessionStorage on mount', async () => {
    sessionStorage.setItem('terra_world_id', WORLD_ID);
    mockGetWorldMetadata.mockResolvedValue(mockMetadata);

    render(<App apiClient={mockApiClient} />);

    await waitFor(() => expect(screen.getByTestId('world-canvas')).toBeInTheDocument());
    expect(mockGetWorldMetadata).toHaveBeenCalledWith(WORLD_ID);
    expect(screen.queryByTestId('upload-world')).not.toBeInTheDocument();
  });

  it('T-06b does not mount WorldCanvas while getWorldMetadata is pending', () => {
    sessionStorage.setItem('terra_world_id', WORLD_ID);
    mockGetWorldMetadata.mockReturnValue(new Promise<WorldMetadata>(() => {}));

    render(<App apiClient={mockApiClient} />);

    expect(screen.queryByTestId('world-canvas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('highlight-overlay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upload-world')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-restoring')).toBeInTheDocument();
    expect(mockGetWorldMetadata).toHaveBeenCalledWith(WORLD_ID);
  });

  it('T-06c clears session and shows toast when restore hits world_not_found', async () => {
    sessionStorage.setItem('terra_world_id', WORLD_ID);
    mockGetWorldMetadata.mockRejectedValue(
      new WorldNotFoundError('world_not_found', 404, 'world_not_found')
    );

    render(<App apiClient={mockApiClient} />);

    await waitFor(() => expect(screen.getByTestId('upload-world')).toBeInTheDocument());
    expect(screen.queryByTestId('world-canvas')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('terra_world_id')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/ya no está disponible/i)
    );
  });

  it('T-06d handleUploaded persists only worldId to sessionStorage (M10)', () => {
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    expect(sessionStorage.getItem('terra_world_id')).toBe(WORLD_ID);
    // La metadata no se persiste: era write-only y siempre se revalida
    // contra el backend al restaurar.
    expect(sessionStorage.getItem('terra_world_metadata')).toBeNull();
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

  it('test_root_has_no_max_width', () => {
    const root = renderAppInRoot();

    expect(window.getComputedStyle(root).maxWidth).toBe('none');
  });

  it('test_root_fills_viewport_width', () => {
    setViewportWidth(1920);
    const root = renderAppInRoot();

    expect(root.clientWidth).toBeCloseTo(window.innerWidth, 0);
  });

  it('test_root_no_centered_margin', () => {
    const root = renderAppInRoot();
    const style = window.getComputedStyle(root);

    expect(style.marginLeft).toBe('0px');
    expect(style.marginRight).toBe('0px');
  });

  it('test_root_no_text_align_center', () => {
    const root = renderAppInRoot();

    expect(window.getComputedStyle(root).textAlign).not.toBe('center');
  });

  it('test_layout_grid_two_columns', async () => {
    const root = await renderLoadedAppInRoot();
    const appMain = root.querySelector<HTMLElement>('.app-main');

    expect(appMain).not.toBeNull();
    expect(window.getComputedStyle(appMain!).display).toBe('grid');
    expect(appMain!.children).toHaveLength(2);
    expect(appMain!.children[0]).toHaveClass('app-sidebar');
    expect(appMain!.children[1]).toHaveClass('app-canvas-container');
  });

  it('test_canvas_host_grows_with_viewport', async () => {
    setViewportWidth(1920);
    const root = await renderLoadedAppInRoot();
    const canvasHost = root.querySelector<HTMLElement>('.app-canvas-container');

    expect(canvasHost).not.toBeNull();
    expect(canvasHost!.clientWidth).toBeGreaterThan(1500);
  });

  it('test_search_panel_has_stable_width', async () => {
    for (const viewportWidth of [1024, 1440, 1920]) {
      setViewportWidth(viewportWidth);
      const root = await renderLoadedAppInRoot();

      try {
        const appMain = root.querySelector<HTMLElement>('.app-main');
        const panel = root.querySelector<HTMLElement>('.app-sidebar');

        expect(panel).not.toBeNull();
        expect(appMain?.firstElementChild).toBe(panel);
        expect(panel!.clientWidth).toBe(320);
      } finally {
        cleanup();
        sessionStorage.clear();
      }
    }
  });

  it('test_app_renders_without_console_errors', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      render(<App apiClient={mockApiClient} />);
      triggerUpload();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  // ── New: F6 deuda ──────────────────────────────────────────────────────────

  it('smoke: toolbar visible with canvas and search-panel in WorldLoaded', () => {
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('world-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('search-panel')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /propiedades del mundo/i })).toBeInTheDocument();
  });

  it('toolbar zoom in calls setZoom with incremented value', async () => {
    const user = userEvent.setup();
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).not.toBeNull());

    const zoomInBtn = screen.getByRole('button', { name: /zoom in/i });
    await user.click(zoomInBtn);

    expect(mockSetZoom).toHaveBeenCalledWith(ZOOM_LIMITS.initial + ZOOM_LIMITS.step);
  });

  it('toolbar zoom to fit calls canvas handle and updates zoom label', async () => {
    const user = userEvent.setup();
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).not.toBeNull());

    const fitBtn = screen.getByRole('button', { name: /zoom to fit/i });
    await user.click(fitBtn);

    expect(mockZoomToFit).toHaveBeenCalled();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('layer toggles are passed to WorldCanvas', async () => {
    const user = userEvent.setup();
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).toMatchObject({ showWalls: true }));

    await user.click(screen.getByRole('button', { name: /toggle walls/i }));

    await waitFor(() => expect(capturedCanvasProps).toMatchObject({ showWalls: false }));
    expect(capturedCanvasProps).toMatchObject({ showLiquids: true, showWires: false });
  });

  it('wires layer defaults off and its toggle is disabled (E14 corto)', async () => {
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).toMatchObject({ showWires: false }));

    const wiresBtn = screen.getByRole('button', { name: /toggle wires/i });
    expect(wiresBtn).toBeDisabled();
    expect(wiresBtn).toHaveAttribute('title', 'Disponible en v0.3');
  });

  it('HUD zoom in twice advances the shared zoom state (E06)', async () => {
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).not.toBeNull());

    const hudZoomIn = screen.getByLabelText('HUD zoom in');
    act(() => {
      hudZoomIn.click();
    });
    act(() => {
      hudZoomIn.click();
    });

    // Con state.zoom desincronizado (bug E06) ambos clicks pedirían 2.5.
    expect(mockSetZoom).toHaveBeenNthCalledWith(1, ZOOM_LIMITS.initial + ZOOM_LIMITS.step);
    expect(mockSetZoom).toHaveBeenNthCalledWith(2, ZOOM_LIMITS.initial + 2 * ZOOM_LIMITS.step);
  });

  it('onZoomChange from canvas updates the toolbar zoom label (E05 consumidor)', async () => {
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).not.toBeNull());

    act(() => {
      capturedCanvasProps?.onZoomChange?.(4);
    });
    expect(screen.getByText('400%')).toBeInTheDocument();

    // zoomToFit puede quedar bajo ZOOM_LIMITS.min (IT-07): el estado es un
    // espejo del canvas y no clampa.
    act(() => {
      capturedCanvasProps?.onZoomChange?.(0.1);
    });
    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  it('rapid double tile selection keeps only the last detail (E16)', async () => {
    let resolveFirst!: (d: TileDetail) => void;
    let resolveSecond!: (d: TileDetail) => void;
    mockGetTileDetail
      .mockImplementationOnce(
        () =>
          new Promise<TileDetail>((res) => {
            resolveFirst = res;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<TileDetail>((res) => {
            resolveSecond = res;
          })
      );

    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).not.toBeNull());

    act(() => {
      capturedCanvasProps?.onTileSelected?.({ x: 10, y: 20 });
    });
    act(() => {
      capturedCanvasProps?.onTileSelected?.({ x: 30, y: 40 });
    });

    // La respuesta vigente llega primero; la obsoleta después e intenta pisarla.
    await act(async () => {
      resolveSecond({ ...mockTileDetail, x: 30, y: 40 });
    });
    await act(async () => {
      resolveFirst({ ...mockTileDetail, x: 10, y: 20 });
    });

    await waitFor(() => expect(screen.getByTestId('tile-detail-panel')).toBeInTheDocument());
    expect(screen.getByText('30, 40')).toBeInTheDocument();
    expect(screen.queryByText('10, 20')).not.toBeInTheDocument();
  });

  it('sessionStorage failure does not crash the upload flow (E18)', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    try {
      render(<App apiClient={mockApiClient} />);
      triggerUpload();

      expect(screen.getByTestId('world-canvas')).toBeInTheDocument();
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it('toolbar export PNG calls exportToPng and createObjectURL', async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(['fake-png'], { type: 'image/png' });
    mockExportToPng.mockResolvedValue(mockBlob);

    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    try {
      render(<App apiClient={mockApiClient} />);
      triggerUpload();

      await waitFor(() => expect(capturedCanvasProps).not.toBeNull());

      const exportBtn = screen.getByRole('button', { name: /export png/i });
      await user.click(exportBtn);

      await waitFor(() => expect(mockExportToPng).toHaveBeenCalled());
      await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(mockBlob));
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
    }
  });

  it('tile selection triggers getTileDetail and shows tile detail panel', async () => {
    mockGetTileDetail.mockResolvedValue(mockTileDetail);

    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).not.toBeNull());

    act(() => {
      capturedCanvasProps?.onTileSelected?.({ x: 10, y: 20 });
    });

    await waitFor(() => expect(mockGetTileDetail).toHaveBeenCalledWith(WORLD_ID, 10, 20));
    await waitFor(() => expect(screen.getByTestId('tile-detail-panel')).toBeInTheDocument());
  });

  it('tile detail panel shows names instead of internal ids', async () => {
    mockGetTileDetail.mockResolvedValue({
      ...mockTileDetail,
      tile_id: 21,
      wall_id: 1,
      chest_id: 5,
    });

    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).not.toBeNull());

    act(() => {
      capturedCanvasProps?.onTileSelected?.({ x: 10, y: 20 });
    });

    await waitFor(() => expect(screen.getByTestId('tile-detail-panel')).toBeInTheDocument());

    expect(screen.getAllByText('Cofre').length).toBeGreaterThan(0);
    expect(screen.getByText('Pared de piedra')).toBeInTheDocument();
    expect(screen.queryByText(/tile id/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/wall id/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cofre id/i)).not.toBeInTheDocument();
    expect(screen.queryByText('21')).not.toBeInTheDocument();
  });

  it('tile detail panel resolves wall ids known in tileColors but not previously named', async () => {
    mockGetTileDetail.mockResolvedValue({
      ...mockTileDetail,
      tile_id: 1,
      wall_id: 3,
    });

    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).not.toBeNull());

    act(() => {
      capturedCanvasProps?.onTileSelected?.({ x: 10, y: 20 });
    });

    await waitFor(() => expect(screen.getByTestId('tile-detail-panel')).toBeInTheDocument());

    expect(screen.queryByText(/pared desconocida/i)).not.toBeInTheDocument();
    expect(screen.getByText(/pared de ebonita/i)).toBeInTheDocument();
  });

  it('tile detail panel falls back to id placeholder when name is unknown', async () => {
    mockGetTileDetail.mockResolvedValue({
      ...mockTileDetail,
      tile_id: 999,
      wall_id: 999,
    });

    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).not.toBeNull());

    act(() => {
      capturedCanvasProps?.onTileSelected?.({ x: 10, y: 20 });
    });

    await waitFor(() => expect(screen.getByTestId('tile-detail-panel')).toBeInTheDocument());

    expect(screen.getByText('Terreno #999')).toBeInTheDocument();
    expect(screen.getByText('Pared #999')).toBeInTheDocument();
    expect(screen.queryByText(/desconocid[ao]/i)).not.toBeInTheDocument();
  });

  it('tile detail panel labels tile_id 180 as Brown Moss (not Bloque eco / Terreno #180)', async () => {
    mockGetTileDetail.mockResolvedValue({
      ...mockTileDetail,
      tile_id: 180,
      wall_id: null,
    });

    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).not.toBeNull());

    act(() => {
      capturedCanvasProps?.onTileSelected?.({ x: 10, y: 20 });
    });

    await waitFor(() => expect(screen.getByTestId('tile-detail-panel')).toBeInTheDocument());

    expect(screen.getByText('Brown Moss')).toBeInTheDocument();
    expect(screen.queryByText('Bloque eco')).not.toBeInTheDocument();
    expect(screen.queryByText('Terreno #180')).not.toBeInTheDocument();
  });

  it('NPC list click centers canvas on NPC coords', async () => {
    const user = userEvent.setup();
    mockListNpcs.mockResolvedValue(mockNpcs);

    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    await waitFor(() => expect(capturedCanvasProps).not.toBeNull());

    const npcToggle = screen.getByRole('button', { name: /npcs/i });
    await user.click(npcToggle);

    await waitFor(() => expect(screen.getByText('Guide')).toBeInTheDocument());

    const guideBtn = screen.getByRole('button', { name: /guide/i });
    await user.click(guideBtn);

    expect(mockCenterOn).toHaveBeenCalledWith(150, 300);
  });

  it('mobile: sidebar has data-open=false at viewport <768px', async () => {
    setViewportWidth(767);
    const root = await renderLoadedAppInRoot();
    const sidebar = root.querySelector('.app-sidebar');

    expect(sidebar).not.toBeNull();
    expect(sidebar).toHaveAttribute('data-open', 'false');
  });
});
