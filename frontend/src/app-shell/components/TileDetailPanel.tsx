import { type FC } from 'react';
import { useAppContext } from '../AppContext';
import type { TileDetail } from '../../api-client';

interface TileDetailPanelProps {
  onClose: () => void;
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}): React.ReactElement {
  return (
    <div className="app-tile-detail-row">
      <span className="app-tile-detail-label">{label}</span>
      <span className="app-tile-detail-value">{value ?? '—'}</span>
    </div>
  );
}

function formatDetail(detail: TileDetail): Array<{ label: string; value: string | number | null }> {
  return [
    { label: 'Posición', value: `${detail.x}, ${detail.y}` },
    { label: 'Tile ID', value: detail.tile_id },
    { label: 'Wall ID', value: detail.wall_id },
    {
      label: 'Líquido',
      value:
        detail.liquid_type !== 'none' ? `${detail.liquid_type} (${detail.liquid_amount})` : null,
    },
    {
      label: 'Frame',
      value: detail.frame_x != null ? `${detail.frame_x}, ${detail.frame_y}` : null,
    },
    { label: 'Cofre ID', value: detail.chest_id ?? null },
    { label: 'Cartel ID', value: detail.sign_id ?? null },
    { label: 'Entidad', value: detail.tile_entity_id ?? null },
  ];
}

export const TileDetailPanel: FC<TileDetailPanelProps> = ({ onClose }) => {
  const { state } = useAppContext();

  if (state.kind !== 'WorldLoaded') return null;
  const { tileDetail } = state;
  if (tileDetail === null) return null;

  const rows = formatDetail(tileDetail);

  return (
    <div className="app-tile-detail" data-testid="tile-detail-panel">
      <div className="app-tile-detail-header">
        <strong className="app-tile-detail-title">Tile seleccionado</strong>
        <button className="app-tile-detail-close" onClick={onClose} aria-label="Cerrar panel tile">
          ✕
        </button>
      </div>
      {rows.map(({ label, value }) => (
        <Row key={label} label={label} value={value} />
      ))}
    </div>
  );
};
