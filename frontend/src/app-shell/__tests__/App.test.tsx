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
import { INITIAL_ZOOM, ZOOM_STEP } from '../appState';

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
  mockZoomToFit.mockReturnValue(0.5);
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
  sessionStorage.setItem('terra_world_metadata', JSON.stringify(mockMetadata));
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
    sessionStorage.setItem('terra_world_metadata', JSON.stringify(mockMetadata));
    mockGetWorldMetadata.mockResolvedValue(mockMetadata);

    render(<App apiClient={mockApiClient} />);

    await waitFor(() => expect(screen.getByTestId('world-canvas')).toBeInTheDocument());
    expect(mockGetWorldMetadata).toHaveBeenCalledWith(WORLD_ID);
    expect(screen.queryByTestId('upload-world')).not.toBeInTheDocument();
  });

  it('T-06b does not mount WorldCanvas while getWorldMetadata is pending', () => {
    sessionStorage.setItem('terra_world_id', WORLD_ID);
    sessionStorage.setItem('terra_world_metadata', JSON.stringify(mockMetadata));
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
    sessionStorage.setItem('terra_world_metadata', JSON.stringify(mockMetadata));
    mockGetWorldMetadata.mockRejectedValue(
      new WorldNotFoundError('world_not_found', 404, 'world_not_found')
    );

    render(<App apiClient={mockApiClient} />);

    await waitFor(() => expect(screen.getByTestId('upload-world')).toBeInTheDocument());
    expect(screen.queryByTestId('world-canvas')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('terra_world_id')).toBeNull();
    expect(sessionStorage.getItem('terra_world_metadata')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/ya no está disponible/i)
    );
  });

  it('T-06d handleUploaded persists worldId and metadata to sessionStorage', () => {
    render(<App apiClient={mockApiClient} />);
    triggerUpload();

    expect(sessionStorage.getItem('terra_world_id')).toBe(WORLD_ID);
    expect(sessionStorage.getItem('terra_world_metadata')).toBe(JSON.stringify(mockMetadata));
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

    expect(mockSetZoom).toHaveBeenCalledWith(INITIAL_ZOOM + ZOOM_STEP);
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
    expect(capturedCanvasProps).toMatchObject({ showLiquids: true, showWires: true });
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
