import { describe, it, expect } from 'vitest';
import {
  classifyBackgroundBand,
  getTileColor,
  getWallColor,
  getLiquidColor,
  getBackgroundColor,
  getSkyGradientColor,
  resolveBackgroundBreakpoints,
  SKY_TOP_COLOR,
  SKY_BAND_COLOR,
  DIRT_BAND_COLOR,
  ROCK_BAND_COLOR,
  HELL_BAND_COLOR,
} from '../tileColors';

const DEFAULT_TILE = '#555555';
const DEFAULT_WALL = '#3a3a3a';
const AIR = SKY_BAND_COLOR;

describe('tileColors palette (extended)', () => {
  it('air tile (tileId < 0) returns the air color', () => {
    expect(getTileColor(-1)).toBe(AIR);
  });

  it('legacy core tile ids still map (Dirt/Stone/Grass)', () => {
    expect(getTileColor(0)).not.toBe(DEFAULT_TILE);
    expect(getTileColor(1)).not.toBe(DEFAULT_TILE);
    expect(getTileColor(2)).not.toBe(DEFAULT_TILE);
  });

  it('hardmode ores cobalt/mythril/adamantite/chlorophyte have non-default colors', () => {
    for (const id of [107, 108, 111, 211]) {
      expect(getTileColor(id)).not.toBe(DEFAULT_TILE);
    }
  });

  it('ice variants and snow are mapped (147, 161, 162, 163, 164)', () => {
    for (const id of [147, 161, 162, 163, 164]) {
      expect(getTileColor(id)).not.toBe(DEFAULT_TILE);
    }
  });

  it('biome stones (Pearlstone, Sandstone variants) are mapped', () => {
    for (const id of [117, 397, 400, 404]) {
      expect(getTileColor(id)).not.toBe(DEFAULT_TILE);
    }
  });

  it('unknown tile id falls back to default tile color', () => {
    expect(getTileColor(99999)).toBe(DEFAULT_TILE);
  });

  it('walls: dungeon and cavern variants mapped (41, 121, 122, 351)', () => {
    for (const id of [41, 121, 122, 351]) {
      expect(getWallColor(id)).not.toBe(DEFAULT_WALL);
    }
  });

  it('unknown wall id falls back to default wall color', () => {
    expect(getWallColor(99999)).toBe(DEFAULT_WALL);
  });

  it('shimmer liquid (type 4) returns a non-default color', () => {
    expect(getLiquidColor(4)).not.toBe(getLiquidColor(1));
  });

  it('chest tiles (21, 441, 467, 468) are visually distinct from wood/stone', () => {
    const wood = getTileColor(30);
    const stone = getTileColor(1);
    for (const id of [21, 441, 467, 468]) {
      const color = getTileColor(id);
      expect(color).not.toBe(DEFAULT_TILE);
      expect(color).not.toBe(wood);
      expect(color).not.toBe(stone);
    }
  });

  it('hardmode walls (dungeon, hallowed) mapped vividly', () => {
    for (const id of [7, 8, 9, 347]) {
      expect(getWallColor(id)).not.toBe(DEFAULT_WALL);
    }
  });

  it('moss / moss-brick tiles (179-183, 381, 534, 536, 539, 625, 627, 687-692) have explicit colors', () => {
    const mossIds = [
      179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627, 687, 688, 689, 690, 691, 692,
    ];
    for (const id of mossIds) {
      expect(getTileColor(id)).not.toBe(DEFAULT_TILE);
    }
  });

  it('moss tiles use TerraMap-derived hex (179 Green, 180 Brown, 181 Red, 182 Blue, 183 Purple)', () => {
    expect(getTileColor(179)).toBe('#318672');
    expect(getTileColor(180)).toBe('#7e8631');
    expect(getTileColor(181)).toBe('#863b31');
    expect(getTileColor(182)).toBe('#2b568c');
    expect(getTileColor(183)).toBe('#793186');
  });

  it('moss brick tiles share hex with their moss counterparts', () => {
    expect(getTileColor(687)).toBe(getTileColor(381)); // Lava
    expect(getTileColor(688)).toBe(getTileColor(539)); // Argon
    expect(getTileColor(689)).toBe(getTileColor(534)); // Krypton
    expect(getTileColor(690)).toBe(getTileColor(536)); // Xenon
    expect(getTileColor(691)).toBe(getTileColor(625)); // Neon
    expect(getTileColor(692)).toBe(getTileColor(627)); // Helium
  });

  it('every Terraria tile id 0-720 resolves to a non-default color via fallback palette', () => {
    const skipped = new Set<number>([4, 60]); // 4 (Torches) and a couple alts share core hex
    let missing = 0;
    for (let id = 0; id <= 720; id++) {
      if (skipped.has(id)) continue;
      if (getTileColor(id) === DEFAULT_TILE) missing++;
    }
    expect(missing).toBeLessThanOrEqual(40);
  });

  it('every Terraria wall id 1-353 resolves to a non-default color via fallback palette', () => {
    let missing = 0;
    for (let id = 1; id <= 353; id++) {
      if (getWallColor(id) === DEFAULT_WALL) missing++;
    }
    expect(missing).toBeLessThanOrEqual(20);
  });

  it('background walls 94-99, 200-203, 218-222, 235, 341-346 have explicit colors', () => {
    const wallIds = [
      94, 95, 96, 97, 98, 99, 200, 201, 202, 203, 218, 219, 220, 221, 222, 235, 341, 342, 343, 344,
      345, 346,
    ];
    for (const id of wallIds) {
      expect(getWallColor(id)).not.toBe(DEFAULT_WALL);
    }
  });
});

describe('getBackgroundColor (TerraMap layer banding)', () => {
  // Layer breakpoints loosely mirror a small medium world.
  const SURFACE = 240;
  const ROCK = 600;
  const HELL = 1100;

  it('returns the sky gradient for rows above the world surface', () => {
    expect(getBackgroundColor(0, SURFACE, ROCK, HELL)).toBe(SKY_TOP_COLOR);
    expect(getBackgroundColor(SURFACE - 1, SURFACE, ROCK, HELL)).toBe(SKY_BAND_COLOR);
  });

  it('interpolates the sky between top and horizon colors', () => {
    const middleSky = getSkyGradientColor(120, SURFACE);
    expect(middleSky).not.toBe(SKY_TOP_COLOR);
    expect(middleSky).not.toBe(SKY_BAND_COLOR);
    expect(middleSky).not.toBe(DIRT_BAND_COLOR);
  });

  it('returns the dirt band color between the surface and rock layers', () => {
    expect(getBackgroundColor(SURFACE, SURFACE, ROCK, HELL)).toBe(DIRT_BAND_COLOR);
    expect(getBackgroundColor(ROCK - 1, SURFACE, ROCK, HELL)).toBe(DIRT_BAND_COLOR);
  });

  it('classifies open-sky columns by surface_y while keeping a stable global gradient', () => {
    const canyonAirY = 320;
    // openSky=420 puts canyonAirY in the sky band — color comes from the
    // global surface gradient (clamped at the horizon), NOT from a per-column
    // gradient that would draw a brighter vertical streak.
    expect(getBackgroundColor(canyonAirY, SURFACE, ROCK, HELL, 1200, 420)).toBe(
      getSkyGradientColor(Math.min(canyonAirY, SURFACE - 1), SURFACE)
    );
    // openSky=300 leaves canyonAirY below the column terrain → dirt band.
    expect(getBackgroundColor(canyonAirY, SURFACE, ROCK, HELL, 1200, 300)).toBe(DIRT_BAND_COLOR);
    // Two columns with different surface_y but same worldY in the sky band
    // must produce the same color — no vertical seams.
    expect(getBackgroundColor(canyonAirY, SURFACE, ROCK, HELL, 1200, 420)).toBe(
      getBackgroundColor(canyonAirY, SURFACE, ROCK, HELL, 1200, 580)
    );
  });

  it('returns the rock band color between the rock and hell layers', () => {
    expect(getBackgroundColor(ROCK, SURFACE, ROCK, HELL)).toBe(ROCK_BAND_COLOR);
    expect(getBackgroundColor(HELL - 1, SURFACE, ROCK, HELL)).toBe(ROCK_BAND_COLOR);
  });

  it('returns the hell band color (black) for rows at or below the hell layer', () => {
    expect(getBackgroundColor(HELL, SURFACE, ROCK, HELL)).toBe(HELL_BAND_COLOR);
    expect(getBackgroundColor(HELL + 500, SURFACE, ROCK, HELL)).toBe(HELL_BAND_COLOR);
  });

  it('cavern depth without wall resolves to ROCK_BAND_COLOR via getBackgroundColor', () => {
    const cavernY = Math.floor((ROCK + HELL) / 2);
    expect(getBackgroundColor(cavernY, SURFACE, ROCK, HELL)).toBe(ROCK_BAND_COLOR);
  });

  it('falls back to a usable sky breakpoint when metadata layers are zero', () => {
    expect(getBackgroundColor(0, 0, 0, 0, 1200)).toBe(SKY_TOP_COLOR);
    expect(getBackgroundColor(239, 0, 0, 0, 1200)).toBe(SKY_BAND_COLOR);
    expect(getBackgroundColor(240, 0, 0, 0, 1200)).toBe(DIRT_BAND_COLOR);
  });

  it('does not treat tiny positive surface metadata as a valid surface', () => {
    expect(getBackgroundColor(10, Number.MIN_VALUE, 0, 0, 1200)).toBe(getSkyGradientColor(10, 240));
    expect(getBackgroundColor(10, 1, 2, 3, 1200)).not.toBe(DIRT_BAND_COLOR);
  });

  it('does not let implausible layer metadata turn the sky brown', () => {
    expect(getBackgroundColor(10, 9000, 9001, 9002, 1200)).toBe(getSkyGradientColor(10, 240));
    expect(getBackgroundColor(700, 9000, 9001, 9002, 1200)).toBe(ROCK_BAND_COLOR);
  });

  it('exposes constants that match TerraMap main.js getTileColor literals', () => {
    expect(SKY_TOP_COLOR).toBe('#082f63');
    expect(SKY_BAND_COLOR).toBe('#84aaf8');
    expect(DIRT_BAND_COLOR).toBe('#583d2e');
    expect(ROCK_BAND_COLOR).toBe('#4a433c');
    expect(HELL_BAND_COLOR).toBe('#000000');
  });
});

describe('background band classification across world sizes', () => {
  // Terraria's canonical layer values for the three world presets, taken from
  // a freshly generated world for each size. The hell layer is derived from
  // TerraMap's formula: `maxTilesY - 235` (the bottom 235 rows are hell).
  const WORLDS = {
    small: { width: 4200, height: 1200, surface: 245, rock: 411, hell: 965 },
    medium: { width: 6400, height: 1800, surface: 410, rock: 600, hell: 1565 },
    large: { width: 8400, height: 2400, surface: 540, rock: 815, hell: 2165 },
  } as const;

  for (const [size, w] of Object.entries(WORLDS)) {
    it(`small/medium/large: classifies the four bands for a ${size} world (${w.width}x${w.height})`, () => {
      // Sky band: every y above the surface, including 0 and the row just before surface.
      expect(getBackgroundColor(0, w.surface, w.rock, w.hell, w.height)).toBe(SKY_TOP_COLOR);
      expect(getBackgroundColor(w.surface - 1, w.surface, w.rock, w.hell, w.height)).not.toBe(
        DIRT_BAND_COLOR
      );
      // surface boundary: y just before stays sky, y at boundary is dirt.
      expect(getBackgroundColor(w.surface, w.surface, w.rock, w.hell, w.height)).toBe(
        DIRT_BAND_COLOR
      );
      // dirt band: row just before the rock layer remains dirt.
      expect(getBackgroundColor(w.rock - 1, w.surface, w.rock, w.hell, w.height)).toBe(
        DIRT_BAND_COLOR
      );
      // rock boundary: y at boundary is rock.
      expect(getBackgroundColor(w.rock, w.surface, w.rock, w.hell, w.height)).toBe(ROCK_BAND_COLOR);
      // rock band: row just before hell remains rock.
      expect(getBackgroundColor(w.hell - 1, w.surface, w.rock, w.hell, w.height)).toBe(
        ROCK_BAND_COLOR
      );
      // hell boundary: y at boundary is hell.
      expect(getBackgroundColor(w.hell, w.surface, w.rock, w.hell, w.height)).toBe(HELL_BAND_COLOR);
      // hell band: row near bedrock remains hell.
      expect(getBackgroundColor(w.height - 1, w.surface, w.rock, w.hell, w.height)).toBe(
        HELL_BAND_COLOR
      );
    });
  }

  it('surface_y per column extends sky inside the surface band but never past rock', () => {
    const { surface, rock, hell, height } = WORLDS.small;
    // Canyon: sky extends down — color matches the GLOBAL-surface gradient,
    // clamped to the horizon, never a per-column gradient.
    const canyon = getBackgroundColor(380, surface, rock, hell, height, 400);
    expect(canyon).toBe(getSkyGradientColor(Math.min(380, surface - 1), surface));
    // Two canyons of different per-column depth at the same worldY share the
    // same color — no vertical seams.
    expect(canyon).toBe(getBackgroundColor(380, surface, rock, hell, height, 405));
    // Bogus per-column surface deep into the rock layer must NOT repaint rock as sky.
    expect(getBackgroundColor(500, surface, rock, hell, height, 800)).toBe(ROCK_BAND_COLOR);
    // Even an absurd per-column surface at the world bottom must not turn hell into sky.
    expect(getBackgroundColor(1000, surface, rock, hell, height, height - 1)).toBe(HELL_BAND_COLOR);
    // The rock boundary still wins: y at rock stays rock under any per-column value.
    expect(getBackgroundColor(rock, surface, rock, hell, height, 900)).toBe(ROCK_BAND_COLOR);
  });

  it('falls back to TerraMap-correct hell layer (h - 235) when metadata is missing', () => {
    // Small: hell at 965, not 1080. The row before stays rock.
    expect(getBackgroundColor(964, 0, 0, 0, 1200)).toBe(ROCK_BAND_COLOR);
    expect(getBackgroundColor(965, 0, 0, 0, 1200)).toBe(HELL_BAND_COLOR);
    // Medium: hell at 1565, not 1620.
    expect(getBackgroundColor(1564, 0, 0, 0, 1800)).toBe(ROCK_BAND_COLOR);
    expect(getBackgroundColor(1565, 0, 0, 0, 1800)).toBe(HELL_BAND_COLOR);
    // Large: hell at 2165, not 2160.
    expect(getBackgroundColor(2164, 0, 0, 0, 2400)).toBe(ROCK_BAND_COLOR);
    expect(getBackgroundColor(2165, 0, 0, 0, 2400)).toBe(HELL_BAND_COLOR);
  });

  it('resolveBackgroundBreakpoints produces Terraria-shaped fallback proportions', () => {
    expect(resolveBackgroundBreakpoints(1200, 0, 0, 0)).toEqual({
      surface: 240,
      rock: 408,
      hell: 965,
    });
    expect(resolveBackgroundBreakpoints(1800, 0, 0, 0)).toEqual({
      surface: 360,
      rock: 612,
      hell: 1565,
    });
    expect(resolveBackgroundBreakpoints(2400, 0, 0, 0)).toEqual({
      surface: 480,
      rock: 816,
      hell: 2165,
    });
  });

  it('classifyBackgroundBand exposes the single rule used by getBackgroundColor', () => {
    const bp = resolveBackgroundBreakpoints(1200, 245, 411, 965);
    expect(classifyBackgroundBand(0, bp)).toBe('sky');
    expect(classifyBackgroundBand(244, bp)).toBe('sky');
    expect(classifyBackgroundBand(245, bp)).toBe('dirt');
    expect(classifyBackgroundBand(410, bp)).toBe('dirt');
    expect(classifyBackgroundBand(411, bp)).toBe('rock');
    expect(classifyBackgroundBand(964, bp)).toBe('rock');
    expect(classifyBackgroundBand(965, bp)).toBe('hell');
    // Per-column surface_y clamp: open sky never crosses into rock/hell.
    expect(classifyBackgroundBand(500, bp, 800)).toBe('rock');
    expect(classifyBackgroundBand(1000, bp, 1199)).toBe('hell');
    expect(classifyBackgroundBand(380, bp, 400)).toBe('sky');
  });
});
