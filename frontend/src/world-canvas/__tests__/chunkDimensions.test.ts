import { describe, expect, it } from 'vitest';
import { computeChunkDimensions } from '../chunkDimensions';

describe('computeChunkDimensions', () => {
  it('T-D1 should return full dimensions for an interior chunk', () => {
    expect(computeChunkDimensions(0, 0, 256, 8400, 2400)).toEqual({ w: 256, h: 256 });
  });

  it('T-D2 should clip width for a right-edge chunk', () => {
    expect(computeChunkDimensions(32, 0, 256, 8400, 2400)).toEqual({ w: 208, h: 256 });
  });

  it('T-D3 should clip height for a bottom-edge chunk', () => {
    expect(computeChunkDimensions(0, 9, 256, 8400, 2400)).toEqual({ w: 256, h: 96 });
  });

  it('T-D4 should clip both dimensions for a bottom-right chunk', () => {
    expect(computeChunkDimensions(32, 9, 256, 8400, 2400)).toEqual({ w: 208, h: 96 });
  });
});
