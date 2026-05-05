import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createApiClient } from '../api-client';
import type { ApiClient, SearchMatch, SearchResult, WorldMetadata } from '../api-client';
import { UploadWorld } from '../ui-upload';
import type { UploadResult } from '../ui-upload';
import { WorldCanvas } from '../world-canvas';
import type { WorldCanvasHandle } from '../world-canvas';
import { SearchPanel } from '../search-panel';
import { HighlightOverlay } from '../highlight-overlay';
import './App.css';

export interface AppProps {
  apiClient?: ApiClient;
}

// ── State machine ─────────────────────────────────────────────────────────────

type AppState =
  | { kind: 'NoWorld' }
  | { kind: 'WorldLoaded'; worldId: string; metadata: WorldMetadata; matches: SearchMatch[] };

type AppAction =
  | { type: 'UPLOAD_SUCCESS'; worldId: string; metadata: WorldMetadata }
  | { type: 'SET_MATCHES'; matches: SearchMatch[] }
  | { type: 'CLOSE_WORLD' };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'UPLOAD_SUCCESS':
      return {
        kind: 'WorldLoaded',
        worldId: action.worldId,
        metadata: action.metadata,
        matches: [],
      };
    case 'SET_MATCHES':
      if (state.kind !== 'WorldLoaded') return state;
      return { ...state, matches: action.matches };
    case 'CLOSE_WORLD':
      return { kind: 'NoWorld' };
  }
}

// ── sessionStorage helpers ────────────────────────────────────────────────────

const SK_ID = 'terra_world_id';
const SK_META = 'terra_world_metadata';

function readSessionState(): AppState {
  try {
    const id = sessionStorage.getItem(SK_ID);
    const raw = sessionStorage.getItem(SK_META);
    if (id !== null && raw !== null) {
      const metadata = JSON.parse(raw) as WorldMetadata;
      return { kind: 'WorldLoaded', worldId: id, metadata, matches: [] };
    }
  } catch {
    // corrupt — ignore
  }
  return { kind: 'NoWorld' };
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

  const [state, dispatch] = useReducer(reducer, undefined, readSessionState);
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

  const handleUploaded = useCallback((r: UploadResult) => {
    sessionStorage.setItem(SK_ID, r.worldId);
    sessionStorage.setItem(SK_META, JSON.stringify(r.metadata));
    dispatch({ type: 'UPLOAD_SUCCESS', worldId: r.worldId, metadata: r.metadata });
  }, []);

  const handleResults = useCallback((result: SearchResult | null) => {
    dispatch({ type: 'SET_MATCHES', matches: result?.matches ?? [] });
  }, []);

  const handleMatchFocus = useCallback(
    (match: SearchMatch) => {
      canvasHandle?.centerOn(match.x, match.y);
    },
    [canvasHandle]
  );

  const handleCloseWorld = useCallback(async (): Promise<void> => {
    if (state.kind !== 'WorldLoaded') return;
    const { worldId } = state;
    try {
      await client.deleteWorld(worldId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al cerrar el mundo');
    }
    sessionStorage.removeItem(SK_ID);
    sessionStorage.removeItem(SK_META);
    dispatch({ type: 'CLOSE_WORLD' });
    setCanvasHandle(null);
  }, [state, client, showToast]);

  return (
    <ErrorBoundary>
      <div className="app">
        {state.kind === 'NoWorld' ? (
          <div className="app-upload-center">
            <h1 className="app-title">TerraScrap</h1>
            <UploadWorld onUploaded={handleUploaded} apiClient={client} />
          </div>
        ) : (
          <>
            <header className="app-header">
              <h1 className="app-title">TerraScrap</h1>
              <span className="app-world-name">{state.metadata.name}</span>
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
              <aside className="app-sidebar">
                <SearchPanel
                  worldId={state.worldId}
                  apiClient={client}
                  onResults={handleResults}
                  onMatchFocus={handleMatchFocus}
                />
              </aside>
              <div className="app-canvas-container">
                <WorldCanvas
                  worldId={state.worldId}
                  metadata={state.metadata}
                  apiClient={client}
                  onReady={setCanvasHandle}
                />
                <HighlightOverlay canvasHandle={canvasHandle} matches={state.matches} />
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
    </ErrorBoundary>
  );
};
