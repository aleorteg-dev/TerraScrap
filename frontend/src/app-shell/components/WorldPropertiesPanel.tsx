import { type FC } from 'react';
import type { WorldMetadata } from '../../api-client';

interface WorldPropertiesPanelProps {
  metadata: WorldMetadata;
}

export const WorldPropertiesPanel: FC<WorldPropertiesPanelProps> = ({ metadata }) => {
  const rows = [
    ['Tamaño', `${metadata.width} x ${metadata.height}`],
    ['Versión', String(metadata.version)],
    ['Seed', metadata.seed],
    ['Modo difícil', metadata.hardmode ? 'Sí' : 'No'],
    ['Spawn', `${metadata.spawn_x}, ${metadata.spawn_y}`],
    ['Superficie', String(metadata.world_surface_y)],
    ['Roca', String(metadata.rock_layer_y)],
    ['Infierno', String(metadata.hell_layer_y)],
  ] as const;

  return (
    <section className="app-world-properties" aria-label="Propiedades del mundo">
      <h2>Propiedades</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="app-world-property-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
