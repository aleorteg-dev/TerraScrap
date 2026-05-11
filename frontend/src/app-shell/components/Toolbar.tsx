import { type FC } from 'react';
import { useAppContext } from '../AppContext';
import { ZOOM_STEP, MAX_ZOOM, MIN_ZOOM, INITIAL_ZOOM } from '../appState';

export const Toolbar: FC = () => {
  const { state, dispatch, canvasHandle } = useAppContext();

  if (state.kind !== 'WorldLoaded') return null;

  const { zoom, layers, maskMode } = state;

  function applyZoom(next: number): void {
    dispatch({ type: 'SET_ZOOM', zoom: next });
    canvasHandle?.setZoom(next);
  }

  function handleExportPng(): void {
    void (async () => {
      if (!canvasHandle) return;
      const blob = await canvasHandle.exportToPng();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'terrascrap-export.png';
      a.click();
      URL.revokeObjectURL(url);
    })();
  }

  const layerLabels: Record<keyof typeof layers, string> = {
    walls: 'Paredes',
    liquids: 'Líquidos',
    wires: 'Cables',
    grid: 'Capas',
  };

  return (
    <div role="toolbar" className="app-toolbar" aria-label="Controles del mundo">
      <div className="app-toolbar-group">
        <button
          aria-label="Zoom in"
          className="app-toolbar-btn"
          onClick={() => applyZoom(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}
          disabled={zoom >= MAX_ZOOM}
        >
          +
        </button>
        <span className="app-toolbar-zoom-label" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button
          aria-label="Zoom out"
          className="app-toolbar-btn"
          onClick={() => applyZoom(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}
          disabled={zoom <= MIN_ZOOM}
        >
          −
        </button>
        <button
          aria-label="Reset view"
          className="app-toolbar-btn"
          onClick={() => applyZoom(INITIAL_ZOOM)}
        >
          Reset
        </button>
      </div>

      <div className="app-toolbar-group">
        {(Object.keys(layers) as Array<keyof typeof layers>).map((layer) => (
          <button
            key={layer}
            aria-label={`Toggle ${layer}`}
            aria-pressed={layers[layer]}
            className={`app-toolbar-btn${layers[layer] ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_LAYER', layer })}
          >
            {layerLabels[layer]}
          </button>
        ))}
      </div>

      <div className="app-toolbar-group">
        <button
          aria-label="Toggle mask mode"
          aria-pressed={maskMode}
          className={`app-toolbar-btn${maskMode ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'TOGGLE_MASK_MODE' })}
        >
          Máscara
        </button>
        <button aria-label="Export PNG" className="app-toolbar-btn" onClick={handleExportPng}>
          PNG
        </button>
      </div>
    </div>
  );
};
