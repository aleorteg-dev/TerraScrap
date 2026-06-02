import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createApiClient, WorldNotFoundError } from '../api-client';
import type { ApiClient, SearchMatch, SearchResult } from '../api-client';
import { UploadWorld } from '../ui-upload';
import type { UploadResult } from '../ui-upload';
import { WorldCanvas } from '../world-canvas';
import type { WorldCanvasHandle } from '../world-canvas';
import { SearchPanel } from '../search-panel';
import { HighlightOverlay } from '../highlight-overlay';
import { AppContext } from './AppContext';
import { appReducer } from './appState';
import { Toolbar } from './components/Toolbar';
import { NpcPanel } from './components/NpcPanel';
import { TileDetailPanel } from './components/TileDetailPanel';
import { WorldPropertiesPanel } from './components/WorldPropertiesPanel';
import './App.css';

export interface AppProps {
  apiClient?: ApiClient;
}

// ── sessionStorage helpers ────────────────────────────────────────────────────

const SK_ID = 'terra_world_id';
const SK_META = 'terra_world_metadata';

function readPersistedWorldId(): string | null {
  try {
    return sessionStorage.getItem(SK_ID);
  } catch {
    return null;
  }
}

function clearPersistedSession(): void {
  try {
    sessionStorage.removeItem(SK_ID);
    sessionStorage.removeItem(SK_META);
  } catch {
    // ignore
  }
}

// ── Error boundary ────────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div role="alert" className="app-error-boundary">
          Error inesperado. Recarga la página.
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export const App: React.FC<AppProps> = ({ apiClient: apiClientProp }) => {
  const client = useMemo(() => apiClientProp ?? createApiClient(), [apiClientProp]);

  const [state, dispatch] = useReducer(appReducer, { kind: 'NoWorld' } as const);
  const [restoring, setRestoring] = useState<boolean>(() => readPersistedWorldId() !== null);
  const [canvasHandle, setCanvasHandle] = useState<WorldCanvasHandle | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // ── Restore from sessionStorage ──────────────────────────────────────────
  // Validate the persisted world_id against the backend before mounting
  // WorldCanvas. If the backend lost the session (server restart, TTL, etc.)
  // surface a toast and fall back to the upload screen.

  useEffect(() => {
    const persistedId = readPersistedWorldId();
    if (persistedId === null) return;
    let cancelled = false;
    void client
      .getWorldMetadata(persistedId)
      .then((metadata) => {
        if (cancelled) return;
        try {
          sessionStorage.setItem(SK_META, JSON.stringify(metadata));
        } catch {
          // ignore
        }
        dispatch({ type: 'UPLOAD_SUCCESS', worldId: persistedId, metadata });
        setRestoring(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        clearPersistedSession();
        setRestoring(false);
        if (err instanceof WorldNotFoundError) {
          showToast('El mundo guardado ya no está disponible. Vuelve a subir el .wld.');
        } else {
          showToast(err instanceof Error ? err.message : 'Error restaurando el mundo');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, showToast]);

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleUploaded = useCallback((r: UploadResult) => {
    sessionStorage.setItem(SK_ID, r.worldId);
    sessionStorage.setItem(SK_META, JSON.stringify(r.metadata));
    dispatch({ type: 'UPLOAD_SUCCESS', worldId: r.worldId, metadata: r.metadata });
  }, []);

  // ── Search results ────────────────────────────────────────────────────────

  const handleResults = useCallback((result: SearchResult | null) => {
    dispatch({ type: 'SET_MATCHES', matches: result?.matches ?? [] });
  }, []);

  // ── Match focus: center + select tile ────────────────────────────────────

  const handleMatchFocus = useCallback(
    (match: SearchMatch) => {
      canvasHandle?.centerOn(match.x, match.y);
      dispatch({ type: 'SELECT_TILE', x: match.x, y: match.y });
    },
    [canvasHandle]
  );

  // ── Tile selection from canvas ────────────────────────────────────────────

  const handleTileSelected = useCallback((tile: { x: number; y: number }) => {
    dispatch({ type: 'SELECT_TILE', x: tile.x, y: tile.y });
  }, []);

  // ── Close world ───────────────────────────────────────────────────────────

  const handleCloseWorld = useCallback(async (): Promise<void> => {
    if (state.kind !== 'WorldLoaded') return;
    const { worldId } = state;
    try {
      await client.deleteWorld(worldId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al cerrar el mundo');
    }
    clearPersistedSession();
    dispatch({ type: 'CLOSE_WORLD' });
    setCanvasHandle(null);
  }, [state, client, showToast]);

  // ── Canvas chunk errors (mid-session world disappearance) ────────────────

  const handleCanvasError = useCallback(
    (err: Error) => {
      if (err instanceof WorldNotFoundError) {
        clearPersistedSession();
        dispatch({ type: 'CLOSE_WORLD' });
        setCanvasHandle(null);
        showToast('El mundo guardado ya no está disponible. Vuelve a subir el .wld.');
      } else {
        showToast(err.message);
      }
    },
    [showToast]
  );

  // ── NPC loading (lazy, once per world) ───────────────────────────────────

  const npcsOpen = state.kind === 'WorldLoaded' ? state.panels.npcs : false;
  const npcsLoaded = state.kind === 'WorldLoaded' ? state.npcs !== null : false;
  const activeWorldId = state.kind === 'WorldLoaded' ? state.worldId : '';

  useEffect(() => {
    if (!npcsOpen || npcsLoaded || activeWorldId === '') return;
    void client
      .listNpcs(activeWorldId)
      .then((npcs) => dispatch({ type: 'SET_NPCS', npcs }))
      .catch((err: unknown) => {
        showToast(err instanceof Error ? err.message : 'Error cargando NPCs');
      });
  }, [npcsOpen, npcsLoaded, activeWorldId, client, showToast]);

  // ── Tile detail loading ───────────────────────────────────────────────────

  const selectedTile = state.kind === 'WorldLoaded' ? state.selectedTile : null;

  useEffect(() => {
    if (!selectedTile || !activeWorldId) return;
    const { x, y } = selectedTile;
    void client
      .getTileDetail(activeWorldId, x, y)
      .then((detail) => dispatch({ type: 'SET_TILE_DETAIL', detail }))
      .catch((err: unknown) => {
        showToast(err instanceof Error ? err.message : 'Error cargando detalle del tile');
      });
  }, [selectedTile, activeWorldId, client, showToast]);

  // ── NPC center ────────────────────────────────────────────────────────────

  const handleNpcCenter = useCallback(
    (x: number, y: number) => {
      canvasHandle?.centerOn(x, y);
    },
    [canvasHandle]
  );

  // ── Context value ─────────────────────────────────────────────────────────

  const ctxValue = useMemo(() => ({ state, dispatch, canvasHandle }), [state, canvasHandle]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
      <AppContext.Provider value={ctxValue}>
        <div className="app">
          {restoring ? (
            <div className="app-upload-center" role="status" data-testid="app-restoring">
              <h1 className="app-title">TerraScrap</h1>
              <p>Restaurando mundo…</p>
            </div>
          ) : state.kind === 'NoWorld' ? (
            <div className="app-upload-center">
              <h1 className="app-title">TerraScrap</h1>
              <UploadWorld onUploaded={handleUploaded} apiClient={client} />
            </div>
          ) : (
            <>
              <header className="app-header">
                <button
                  className="app-sidebar-toggle"
                  aria-label="Toggle sidebar"
                  onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
                >
                  ☰
                </button>
                <h1 className="app-title">TerraScrap</h1>
                <span className="app-world-name">{state.metadata.name}</span>
                <Toolbar />
                <button
                  className="app-close-btn"
                  onClick={() => {
                    void handleCloseWorld();
                  }}
                >
                  Cerrar mundo
                </button>
              </header>
              <main className="app-main">
                <aside className="app-sidebar" data-open={state.sidebarOpen ? 'true' : 'false'}>
                  <SearchPanel
                    worldId={state.worldId}
                    apiClient={client}
                    onResults={handleResults}
                    onMatchFocus={handleMatchFocus}
                  />
                  <WorldPropertiesPanel metadata={state.metadata} />
                  <button
                    className="app-panel-toggle"
                    aria-expanded={state.panels.npcs}
                    onClick={() => dispatch({ type: 'TOGGLE_PANEL', panel: 'npcs' })}
                  >
                    <span>NPCs</span>
                    <span>{state.panels.npcs ? '▲' : '▼'}</span>
                  </button>
                  {state.panels.npcs && <NpcPanel onCenterOn={handleNpcCenter} />}
                  {state.tileDetail !== null && (
                    <TileDetailPanel onClose={() => dispatch({ type: 'CLEAR_TILE_SELECTION' })} />
                  )}
                </aside>
                <div className="app-canvas-container">
                  <WorldCanvas
                    worldId={state.worldId}
                    metadata={state.metadata}
                    apiClient={client}
                    onReady={setCanvasHandle}
                    onTileSelected={handleTileSelected}
                    onError={handleCanvasError}
                    showLayerLines={state.layers.grid}
                    showWalls={state.layers.walls}
                    showLiquids={state.layers.liquids}
                    showWires={state.layers.wires}
                  />
                  <HighlightOverlay
                    canvasHandle={canvasHandle}
                    matches={state.matches}
                    style={state.maskMode ? 'mask' : 'pulse'}
                    selectedTile={state.selectedTile}
                  />
                </div>
              </main>
            </>
          )}

          {toast !== null && (
            <div role="alert" className="app-toast">
              {toast}
            </div>
          )}
        </div>
      </AppContext.Provider>
    </ErrorBoundary>
  );
};
