import { useState, type FC } from 'react';
import type { WorldMetadata } from '../../api-client';

interface WorldPropertiesPanelProps {
  metadata: WorldMetadata;
}

export const WorldPropertiesPanel: FC<WorldPropertiesPanelProps> = ({ metadata }) => {
  const [collapsed, setCollapsed] = useState(false);
  const rows = [
    ['Mapa', `${metadata.width} × ${metadata.height}`],
    ['Semilla', metadata.seed],
    ['Modo difícil', metadata.hardmode ? 'Sí' : 'No'],
    ['Punto inicial', `${metadata.spawn_x}, ${metadata.spawn_y}`],
    ['Superficie', String(metadata.world_surface_y)],
    ['Capa de roca', String(metadata.rock_layer_y)],
    ['Infierno', String(metadata.hell_layer_y)],
  ] as const;

  return (
    <section
      className={`panel app-world-properties${collapsed ? ' collapsed' : ''}`}
      aria-label="Propiedades del mundo"
    >
      <button
        type="button"
        className="panel-head"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className="ph-title">
          <span className="eyebrow">Propiedades</span>
        </span>
        <span className="chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      <div className="panel-body">
        <dl className="prop-grid">
          {rows.map(([label, value]) => (
            <div key={label} className="app-world-property-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
};
