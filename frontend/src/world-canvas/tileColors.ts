import { FALLBACK_TILE_COLORS, FALLBACK_WALL_COLORS } from './tilePaletteFallback';

// Curated overrides on top of the TerraMap-derived FALLBACK_TILE_COLORS /
// FALLBACK_WALL_COLORS (tilePaletteFallback.ts), which act as the base palette.
// Keep ONLY entries that deliberately diverge from the fallback or are missing
// from it. Byte-identical duplicates are forbidden (enforced by
// tileColors.test.ts): duplicating ~490 fallback entries here is what produced
// the 5-digit-hex transcription typo class on tile 125 (IT-06, E04/D01).

const CHEST_COLOR = '#fdc94c'; // vivid gold so containers stand out from wood

export const TILE_COLORS: Readonly<Record<number, string>> = {
  0: '#976b4b', // Dirt (absent from fallback)
  5: '#976b4b', // Tree (absent from fallback)
  21: CHEST_COLOR, // Chest
  30: '#976b4b', // Wood block (absent from fallback)
  83: '#4c96d8', // Herb (blooming)
  84: '#b9d62a', // Herb
  99: '#bf8e6f', // Bookcase
  133: '#909490', // Adamantite Forge
  147: '#e9efff', // Snow Block
  148: '#aac7d8', // Ice
  191: '#976b4b', // Living Wood (absent from fallback)
  210: '#bf8e6f', // Land mine (absent from fallback)
  441: CHEST_COLOR, // Chest (alt)
  467: CHEST_COLOR, // Chest (alt)
  468: CHEST_COLOR, // Chest (alt, absent from fallback)
  548: '#fa6432', // Crimsand alt
  583: '#7f7f7f', // Stalactite (absent from fallback)
  584: '#7f7f7f', // Stalactite (absent from fallback)
  595: '#976b4b', // Tree variant (absent from fallback)
  596: '#976b4b', // Tree variant (absent from fallback)
  615: '#976b4b', // Tree variant (absent from fallback)
  616: '#976b4b', // Tree variant (absent from fallback)
  668: '#976b4b', // Dirt variant (absent from fallback)
  692: '#ff4c4c', // Helium Moss Brick (absent from fallback)
};

export const WALL_COLORS: Readonly<Record<number, string>> = {
  21: '#71636e', // Demonite Brick Wall (absent from fallback)
  61: '#37291a', // Wood Wall alt
  73: '#bed3df', // Cloud Wall
  87: '#1b1f2a', // Blue Dungeon Wall
  88: '#581717', // Green Dungeon Wall (absent from fallback)
  89: '#3a1c2a', // Pink Dungeon Wall (absent from fallback)
  168: '#5a6e6f', // Marble Wall (absent from fallback)
  175: '#6e6b73', // Granite Wall
  196: '#3b5043', // Jungle Vine Wall
  316: '#7d6464', // Dungeon variant
  317: '#7d6464', // Dungeon variant
  351: '#c5944c', // Solar Brick Wall (Lunar, absent from fallback)
  353: '#1b6d45', // Pine Wall (absent from fallback)
};

const LIQUID_COLORS: Readonly<Record<number, string>> = {
  1: '#093dbf', // water
  2: '#fd2003', // lava
  3: '#fec214', // honey
  4: '#a17fff', // shimmer
};

// Backdrop band colors ported verbatim from TerraMap (main.js:1019, getTileColor).
// When a cell carries no tile / liquid / wall, the rendered color depends purely
// on its world Y relative to the three world-layer breakpoints.
const SKY_TOP_RGB = [8, 47, 99] as const;
const SKY_HORIZON_RGB = [132, 170, 248] as const;

export const SKY_TOP_COLOR = '#082f63'; // deep navy sky
export const SKY_BAND_COLOR = '#84aaf8'; // rgb(132, 170, 248), horizon / surface sky
export const DIRT_BAND_COLOR = '#583d2e'; // rgb( 88,  61,  46)
export const ROCK_BAND_COLOR = '#4a433c'; // rgb( 74,  67,  60)
export const HELL_BAND_COLOR = '#000000';

// Kept exported for legacy callers of getTileColor(-1); the actual render path
// resolves the air color through getBackgroundColor() against the world layers.
export const AIR_COLOR = SKY_BAND_COLOR;

const DEFAULT_TILE_COLOR = '#555555';
const DEFAULT_WALL_COLOR = '#3a3a3a';
const DEFAULT_LIQUID_COLOR = '#093dbf';

export type BackgroundBand = 'sky' | 'dirt' | 'rock' | 'hell';

export interface BackgroundBreakpoints {
  readonly surface: number;
  readonly rock: number;
  readonly hell: number;
}

function isUsableSurfaceBreakpoint(value: number, worldHeight: number): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (worldHeight < 100) return true;
  const minSurfaceY = Math.max(16, worldHeight * 0.05);
  const maxSurfaceY = worldHeight * 0.75;
  return value >= minSurfaceY && value < maxSurfaceY;
}

function isUsableLowerBreakpoint(value: number, previous: number, worldHeight: number): boolean {
  if (!Number.isFinite(value) || value <= previous) return false;
  if (worldHeight < 100) return true;
  return value < worldHeight * 1.25;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function hexByte(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0');
}

function interpolateColor(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number
): string {
  const ratio = clamp01(t);
  const r = from[0] + (to[0] - from[0]) * ratio;
  const g = from[1] + (to[1] - from[1]) * ratio;
  const b = from[2] + (to[2] - from[2]) * ratio;
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
}

// Resolves the three layer breakpoints. Prefers the .wld metadata when each
// value looks sane; otherwise falls back to Terraria/TerraMap-derived defaults:
//   surface ≈ 0.20 · h
//   rock    ≈ 0.34 · h
//   hell    = h - 235   (Terraria reserves the bottom 235 rows for hell on
//                        every world size; the formula is
//                        `((maxTilesY - 230) - surface)/6 * 6 + surface - 5`,
//                        which simplifies to `maxTilesY - 235`.)
// Naive proportional fallbacks (e.g. hell = h·0.9) misclassify small worlds:
// h=1200 yields hell=1080 instead of 965 and paints ~115 rows of true hell as
// rock band.
export function resolveBackgroundBreakpoints(
  worldHeight: number,
  worldSurfaceY: number,
  rockLayerY: number,
  hellLayerY: number
): BackgroundBreakpoints {
  const h = Number.isFinite(worldHeight) && worldHeight > 0 ? worldHeight : 1200;
  const surface = isUsableSurfaceBreakpoint(worldSurfaceY, h) ? worldSurfaceY : Math.floor(h * 0.2);
  const rock =
    isUsableLowerBreakpoint(rockLayerY, surface, h) && rockLayerY > surface
      ? rockLayerY
      : Math.max(Math.floor(h * 0.34), surface + 1);
  const hell =
    isUsableLowerBreakpoint(hellLayerY, rock, h) && hellLayerY > rock
      ? hellLayerY
      : Math.max(Math.floor(h - 235), rock + 1);
  return { surface, rock, hell };
}

// Per-column open-sky surface_y refines the sky/dirt boundary inside the
// surface band only. It can EXTEND sky downward when a column has air below
// the global surface (canyons, spawn arenas) but is clamped to bp.rock so
// caves and hell can never be repainted as sky — no matter how bogus or
// maximal the per-column value is.
function effectiveSurfaceY(bp: BackgroundBreakpoints, openSkySurfaceY: number | undefined): number {
  if (openSkySurfaceY === undefined || !Number.isFinite(openSkySurfaceY) || openSkySurfaceY <= 0) {
    return bp.surface;
  }
  return Math.min(Math.max(bp.surface, openSkySurfaceY), bp.rock);
}

// Single rule: given a depth and resolved breakpoints, return the band.
export function classifyBackgroundBand(
  worldY: number,
  bp: BackgroundBreakpoints,
  openSkySurfaceY?: number
): BackgroundBand {
  const surface = effectiveSurfaceY(bp, openSkySurfaceY);
  if (worldY < surface) return 'sky';
  if (worldY < bp.rock) return 'dirt';
  if (worldY < bp.hell) return 'rock';
  return 'hell';
}

export function getSkyGradientColor(worldY: number, surfaceY: number): string {
  const denominator = Math.max(surfaceY - 1, 1);
  const t = Number.isFinite(worldY) ? worldY / denominator : 0;
  return interpolateColor(SKY_TOP_RGB, SKY_HORIZON_RGB, t);
}

export function getBackgroundColor(
  worldY: number,
  worldSurfaceY: number,
  rockLayerY: number,
  hellLayerY: number,
  worldHeight = Number.NaN,
  openSkySurfaceY = Number.NaN
): string {
  const bp = resolveBackgroundBreakpoints(worldHeight, worldSurfaceY, rockLayerY, hellLayerY);
  const surface = effectiveSurfaceY(bp, openSkySurfaceY);
  if (worldY < surface) {
    // Sky gradient depends on the GLOBAL surface (bp.surface), never on the
    // per-column openSkySurfaceY. Two adjacent columns whose terrain heights
    // differ must produce the same sky color at a given worldY, so a column
    // dip cannot draw a brighter vertical streak. When a cell is classified
    // as sky but sits at or below the global surface (canyon air below the
    // average terrain line) we clamp to the horizon row so the result is
    // SKY_BAND_COLOR rather than an extrapolation past the gradient end.
    const denom = Math.max(bp.surface, 1);
    const clampedY = Math.min(worldY, Math.max(bp.surface - 1, 0));
    return getSkyGradientColor(clampedY, denom);
  }
  if (worldY < bp.rock) return DIRT_BAND_COLOR;
  if (worldY < bp.hell) return ROCK_BAND_COLOR;
  return HELL_BAND_COLOR;
}

export function getTileColor(tileId: number): string {
  if (tileId < 0) return AIR_COLOR;
  return TILE_COLORS[tileId] ?? FALLBACK_TILE_COLORS[tileId] ?? DEFAULT_TILE_COLOR;
}

export function getWallColor(wallId: number): string {
  return WALL_COLORS[wallId] ?? FALLBACK_WALL_COLORS[wallId] ?? DEFAULT_WALL_COLOR;
}

export function getLiquidColor(liquidType: number): string {
  return LIQUID_COLORS[liquidType] ?? DEFAULT_LIQUID_COLOR;
}

// ── Wires (IT-OPT-4, cadena E14) ─────────────────────────────────────────────

// Colores por tipo de cable, alineados con los cables de Terraria/TerraMap.
export const WIRE_COLORS = {
  red: '#ff3b30',
  blue: '#3b82f6',
  green: '#34c759',
  yellow: '#ffd60a',
} as const;

// Byte flags del encoding v2: bit 2 = rojo, 3 = azul, 4 = verde, 5 = amarillo.
// El bit 1 (actuator) NO pinta. Prioridad rojo > azul > verde > amarillo
// cuando un mismo tile lleva varios cables (un píxel, un color).
export function getWireColor(flags: number): string | null {
  if (flags & 0b0000_0100) return WIRE_COLORS.red;
  if (flags & 0b0000_1000) return WIRE_COLORS.blue;
  if (flags & 0b0001_0000) return WIRE_COLORS.green;
  if (flags & 0b0010_0000) return WIRE_COLORS.yellow;
  return null;
}
