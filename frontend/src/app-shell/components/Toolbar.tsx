import { type FC } from 'react';
import { useAppContext } from '../AppContext';
import { ZOOM_LIMITS } from '../../world-canvas';

export const Toolbar: FC = () => {
  const { state, dispatch, canvasHandle } = useAppContext();

  if (state.kind !== 'WorldLoaded') return null;

  const { zoom, layers, maskMode } = state;

  // El canvas es la fuente única del zoom: setZoom dispara onZoomChange y
  // App lo espeja en state.zoom (E06/D04); aquí no se despacha SET_ZOOM.
  function applyZoom(next: number): void {
    canvasHandle?.setZoom(next);
  }

  function handleExportPng(): void {
    void (async () => {
      if (!canvasHandle) return;
      const canvases = Array.from(
        document.querySelectorAll<HTMLCanvasElement>('.app-canvas-container canvas')
      );
      let blob = await canvasHandle.exportToPng();
      if (canvases.length > 1) {
        const base = canvases[0];
        if (base !== undefined) {
          const composite = document.createElement('canvas');
          composite.width = base.width;
          composite.height = base.height;
          const ctx = composite.getContext('2d');
          if (ctx !== null) {
            for (const canvas of canvases) {
              ctx.drawImage(canvas, 0, 0, composite.width, composite.height);
            }
            const composed = await new Promise<Blob | null>((resolve) =>
              composite.toBlob(resolve, 'image/png')
            );
            if (composed !== null) blob = composed;
          }
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'terrascrap-export.png';
      a.click();
      URL.revokeObjectURL(url);
    })();
  }

  function handleZoomToFit(): void {
    canvasHandle?.zoomToFit();
  }

  const layerLabels: Record<keyof typeof layers, string> = {
    walls: 'Paredes',
    liquids: 'Líquidos',
    wires: 'Cables',
    grid: 'Capas',
  };

  return (
    <div role="toolbar" className="toolbar app-toolbar" aria-label="Controles del mundo">
      <div className="tool-group app-toolbar-group">
        <button
          aria-label="Zoom in"
          className="tool-btn app-toolbar-btn icon-only"
          onClick={() => applyZoom(Math.min(ZOOM_LIMITS.max, zoom + ZOOM_LIMITS.step))}
          disabled={zoom >= ZOOM_LIMITS.max}
        >
          +
        </button>
        <span className="zoom-label app-toolbar-zoom-label" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button
          aria-label="Zoom out"
          className="tool-btn app-toolbar-btn icon-only"
          onClick={() => applyZoom(Math.max(ZOOM_LIMITS.min, zoom - ZOOM_LIMITS.step))}
          disabled={zoom <= ZOOM_LIMITS.min}
        >
          −
        </button>
        <button
          aria-label="Reset view"
          className="tool-btn app-toolbar-btn"
          onClick={() => applyZoom(ZOOM_LIMITS.initial)}
        >
          Reset
        </button>
        <button
          aria-label="Zoom to fit"
          className="tool-btn app-toolbar-btn"
          onClick={handleZoomToFit}
          disabled={!canvasHandle}
        >
          Fit
        </button>
      </div>

      <div className="tool-group app-toolbar-group">
        {(Object.keys(layers) as Array<keyof typeof layers>).map((layer) => (
          <button
            key={layer}
            aria-label={`Toggle ${layer}`}
            aria-pressed={layers[layer]}
            className={`tool-btn app-toolbar-btn${layers[layer] ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_LAYER', layer })}
          >
            {layerLabels[layer]}
          </button>
        ))}
      </div>

      <div className="tool-group app-toolbar-group">
        <button
          aria-label="Toggle mask mode"
          aria-pressed={maskMode}
          className={`tool-btn app-toolbar-btn${maskMode ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'TOGGLE_MASK_MODE' })}
        >
          Máscara
        </button>
        <button
          aria-label="Export PNG"
          className="tool-btn app-toolbar-btn"
          onClick={handleExportPng}
        >
          PNG
        </button>
      </div>
    </div>
  );
};
