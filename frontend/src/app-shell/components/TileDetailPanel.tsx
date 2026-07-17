import { type FC } from 'react';
import { useAppContext } from '../AppContext';
import type { TileDetail } from '../../api-client';
import { TILE_NAMES, WALL_NAMES } from './tileNames';
import { FALLBACK_TILE_NAMES, FALLBACK_WALL_NAMES } from './tileNamesFallback';

interface TileDetailPanelProps {
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="td-row app-tile-detail-row">
      <span className="k app-tile-detail-label">{label}</span>
      <span className="v app-tile-detail-value">{value}</span>
    </div>
  );
}

function describeTile(tileId: number | null): string {
  if (tileId === null) return 'Aire';
  return TILE_NAMES[tileId] ?? FALLBACK_TILE_NAMES[tileId] ?? `Terreno #${tileId}`;
}

function describeWall(wallId: number | null): string {
  if (wallId === null) return 'Sin pared';
  return WALL_NAMES[wallId] ?? FALLBACK_WALL_NAMES[wallId] ?? `Pared #${wallId}`;
}

function describeLiquid(detail: TileDetail): string {
  if (detail.liquid_type === 'none' || detail.liquid_amount <= 0) return 'Sin liquido';
  const liquidNames: Record<TileDetail['liquid_type'], string> = {
    none: 'Sin liquido',
    water: 'Agua',
    lava: 'Lava',
    honey: 'Miel',
    shimmer: 'Shimmer',
  };
  return `${liquidNames[detail.liquid_type]} (${detail.liquid_amount}/255)`;
}

function formatDetail(detail: TileDetail): Array<{ label: string; value: string }> {
  const rows = [
    { label: 'Posicion', value: `${detail.x}, ${detail.y}` },
    { label: 'Terreno', value: describeTile(detail.tile_id) },
    { label: 'Pared', value: describeWall(detail.wall_id) },
    { label: 'Liquido', value: describeLiquid(detail) },
  ];

  if (detail.chest_id !== null) rows.push({ label: 'Contenedor', value: 'Cofre' });
  if (detail.sign_id !== null) rows.push({ label: 'Objeto', value: 'Cartel' });
  if (detail.tile_entity_id !== null) rows.push({ label: 'Objeto', value: 'Objeto especial' });

  return rows;
}

export const TileDetailPanel: FC<TileDetailPanelProps> = ({ onClose }) => {
  const { state } = useAppContext();

  if (state.kind !== 'WorldLoaded') return null;
  const { tileDetail } = state;
  if (tileDetail === null) return null;

  const rows = formatDetail(tileDetail);

  return (
    <div className="tile-detail app-tile-detail" data-testid="tile-detail-panel">
      <div className="td-head app-tile-detail-header">
        <strong className="td-title app-tile-detail-title">Terreno</strong>
        <span className="coord">
          ({tileDetail.x}, {tileDetail.y})
        </span>
        <button
          className="td-close app-tile-detail-close"
          onClick={onClose}
          aria-label="Cerrar panel de terreno"
        >
          x
        </button>
      </div>
      <div className="td-body">
        {rows.map(({ label, value }) => (
          <Row key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
};
