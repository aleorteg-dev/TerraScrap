import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createApiClient, WorldNotFoundError } from '../api-client';
import type { ApiClient, SearchMatch, SearchResult } from '../api-client';
import { UploadWorld } from '../ui-upload';
import type { UploadResult } from '../ui-upload';
import { WorldCanvas, ZOOM_LIMITS } from '../world-canvas';
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

// Solo se persiste el world_id (M10): la metadata se revalida siempre contra
// el backend al restaurar, así que guardarla era write-only.
const SK_ID = 'terra_world_id';

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
    try {
      sessionStorage.setItem(SK_ID, r.worldId);
    } catch {
      // Sin persistencia (cuota, modo privado): la sesión no sobrevive a un
      // reload, pero el mundo recién subido debe cargar igualmente (E18).
    }
    dispatch({ type: 'UPLOAD_SUCCESS', worldId: r.worldId, metadata: r.metadata });
  }, []);

  // ── Zoom: el canvas es la fuente única; el estado lo espeja (E06/D04) ─────

  const handleZoomChange = useCallback((zoom: number) => {
    dispatch({ type: 'SET_ZOOM', zoom });
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
    // La cleanup marca la petición como obsoleta al cambiar la selección:
    // una respuesta tardía nunca pisa el detalle de la selección vigente (E16).
    let stale = false;
    void client
      .getTileDetail(activeWorldId, x, y)
      .then((detail) => {
        if (!stale) dispatch({ type: 'SET_TILE_DETAIL', detail });
      })
      .catch((err: unknown) => {
        if (!stale)
          showToast(err instanceof Error ? err.message : 'Error cargando detalle del tile');
      });
    return () => {
      stale = true;
    };
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
            <div className="landing">
              <div className="landing-pitch">
                <div className="landing-top">
                  <div className="brand">
                    <span className="brand-glyph" aria-hidden="true" />
                    <span className="brand-name">
                      Terra<b>Scrap</b>
                    </span>
                  </div>
                </div>
                <div className="landing-hero">
                  <div className="landing-kicker">
                    <span className="dot" aria-hidden="true" />
                    <span className="eyebrow">EXPLORADOR DE MUNDOS</span>
                  </div>
                  <h1>
                    Encuentra cualquier <span className="accent">ítem</span> en tu mundo de
                    Terraria.
                  </h1>
                  <p className="landing-lede">
                    Sube tu mundo y revela el mapa al completo. Busca por nombre y TerraScrap
                    resalta cada coincidencia.
                  </p>
                  <div className="landing-features">
                    <div className="feature">
                      <span className="feature-num">01</span>
                      <div className="feature-body">
                        <h3>Sin niebla de guerra</h3>
                        <p>Mundo revelado completo para moverte y acercarte con facilidad.</p>
                      </div>
                    </div>
                    <div className="feature">
                      <span className="feature-num">02</span>
                      <div className="feature-body">
                        <h3>Búsqueda profunda</h3>
                        <p>Bloques, paredes, objetos y contenidos de cofres.</p>
                      </div>
                    </div>
                    <div className="feature">
                      <span className="feature-num">03</span>
                      <div className="feature-body">
                        <h3>Local y privado</h3>
                        <p>Tu mundo se conserva solo mientras usas la app.</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="landing-foot">
                  <span>Preparado para mundos de Terraria en PC</span>
                  <span>Tu mapa se conserva solo durante esta sesión</span>
                </div>
              </div>
              <div className="landing-stage">
                <UploadWorld onUploaded={handleUploaded} apiClient={client} />
              </div>
            </div>
          ) : (
            <>
              <header className="topbar app-header">
                <button
                  className="app-sidebar-toggle"
                  aria-label="Toggle sidebar"
                  onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
                >
                  ☰
                </button>
                <div className="brand">
                  <span className="brand-glyph" aria-hidden="true" />
                  <span className="brand-name">
                    Terra<b>Scrap</b>
                  </span>
                </div>
                <div className="topbar-divider" aria-hidden="true" />
                <div className="world-tag">
                  <span className="seed-dot" aria-hidden="true" />
                  <span className="wt-name app-world-name">{state.metadata.name}</span>
                  <span className="wt-meta">
                    {state.metadata.width}×{state.metadata.height}
                  </span>
                </div>
                <Toolbar />
                <button
                  className="btn-ghost danger app-close-btn"
                  onClick={() => {
                    void handleCloseWorld();
                  }}
                >
                  Cerrar mundo
                </button>
              </header>
              <main className="app-main">
                <aside
                  className="app-sidebar sidebar"
                  data-open={state.sidebarOpen ? 'true' : 'false'}
                >
                  <SearchPanel
                    worldId={state.worldId}
                    apiClient={client}
                    onResults={handleResults}
                    onMatchFocus={handleMatchFocus}
                  />
                  <WorldPropertiesPanel metadata={state.metadata} />
                  <div className={`panel${state.panels.npcs ? '' : ' collapsed'}`}>
                    <button
                      className="panel-head app-panel-toggle"
                      aria-expanded={state.panels.npcs}
                      onClick={() => dispatch({ type: 'TOGGLE_PANEL', panel: 'npcs' })}
                    >
                      <span className="ph-title">
                        <span className="eyebrow">NPCs</span>
                      </span>
                      <span className="chevron" aria-hidden="true">
                        ▾
                      </span>
                    </button>
                    {state.panels.npcs && (
                      <div className="panel-body">
                        <NpcPanel onCenterOn={handleNpcCenter} />
                      </div>
                    )}
                  </div>
                  {state.tileDetail !== null && (
                    <TileDetailPanel onClose={() => dispatch({ type: 'CLEAR_TILE_SELECTION' })} />
                  )}
                </aside>
                <div className="app-canvas-container map-region">
                  <WorldCanvas
                    worldId={state.worldId}
                    metadata={state.metadata}
                    apiClient={client}
                    onReady={setCanvasHandle}
                    onTileSelected={handleTileSelected}
                    onZoomChange={handleZoomChange}
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
                  {state.selectedTile !== null && (
                    <div className="coord-readout" aria-hidden="true">
                      <span className="lbl">X</span>
                      <span className="val">{state.selectedTile.x}</span>
                      <span className="sep">·</span>
                      <span className="lbl">Y</span>
                      <span className="val">{state.selectedTile.y}</span>
                    </div>
                  )}
                  <div className="map-hud" aria-hidden="true">
                    <div className="hud-stack">
                      <button
                        className="hud-btn"
                        type="button"
                        onClick={() =>
                          canvasHandle?.setZoom(
                            Math.min(ZOOM_LIMITS.max, state.zoom + ZOOM_LIMITS.step)
                          )
                        }
                        aria-label="HUD zoom in"
                      >
                        +
                      </button>
                      <button
                        className="hud-btn"
                        type="button"
                        onClick={() =>
                          canvasHandle?.setZoom(
                            Math.max(ZOOM_LIMITS.min, state.zoom - ZOOM_LIMITS.step)
                          )
                        }
                        aria-label="HUD zoom out"
                      >
                        −
                      </button>
                      <button
                        className="hud-btn"
                        type="button"
                        onClick={() => canvasHandle?.zoomToFit()}
                        aria-label="HUD center"
                      >
                        ◎
                      </button>
                    </div>
                  </div>
                  {state.matches.length > 0 && (
                    <div className="map-legend" aria-hidden="true">
                      <div className="lg-title">
                        <span>COINCIDENCIAS</span>
                        <span>{state.matches.length}</span>
                      </div>
                      {(['chest', 'block', 'wall', 'object'] as const).map((src) => {
                        const n = state.matches.filter((m) => m.source === src).length;
                        if (n === 0) return null;
                        const label =
                          src === 'chest'
                            ? 'Cofres'
                            : src === 'block'
                              ? 'Bloques'
                              : src === 'wall'
                                ? 'Paredes'
                                : 'Objetos';
                        return (
                          <div key={src} className="lg-row">
                            <span className="swatch" style={{ background: `var(--src-${src})` }} />
                            <span>{label}</span>
                            <span className="n">{n}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
