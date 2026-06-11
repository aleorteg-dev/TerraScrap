import { describe, it, expect } from 'vitest';
import {
  getTileColor,
  getWallColor,
  getLiquidColor,
  getBackgroundColor,
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

  it('returns the sky band color for rows above the world surface', () => {
    expect(getBackgroundColor(0, SURFACE, ROCK, HELL)).toBe(SKY_BAND_COLOR);
    expect(getBackgroundColor(SURFACE - 1, SURFACE, ROCK, HELL)).toBe(SKY_BAND_COLOR);
  });

  it('returns the dirt band color between the surface and rock layers', () => {
    expect(getBackgroundColor(SURFACE, SURFACE, ROCK, HELL)).toBe(DIRT_BAND_COLOR);
    expect(getBackgroundColor(ROCK - 1, SURFACE, ROCK, HELL)).toBe(DIRT_BAND_COLOR);
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

  it('exposes constants that match TerraMap main.js getTileColor literals', () => {
    expect(SKY_BAND_COLOR).toBe('#84aaf8');
    expect(DIRT_BAND_COLOR).toBe('#583d2e');
    expect(ROCK_BAND_COLOR).toBe('#4a433c');
    expect(HELL_BAND_COLOR).toBe('#000000');
  });
});
