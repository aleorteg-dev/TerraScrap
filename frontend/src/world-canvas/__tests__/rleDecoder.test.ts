import { describe, it, expect } from 'vitest';
import { decodeBase64RleV1, decodeBase64RleV1AsV2, decodeBase64RleV2 } from '../rleDecoder';

function encodeV2(
  runs: Array<{
    tileId?: number;
    wallId?: number;
    liquidType?: number;
    liquidAmount?: number;
    frameXHi?: number;
    flags?: number;
    count: number;
  }>,
  frames?: Array<{ runIndex: number; frameXLo: number; frameY: number }>
): string {
  const frameCount = frames?.length ?? 0;
  const runsBytes = runs.length * 10;
  const totalBytes = 8 + runsBytes + frameCount * 6;
  const bytes = new Uint8Array(totalBytes);
  const dv = new DataView(bytes.buffer);

  bytes[0] = 0x54;
  bytes[1] = 0x57;
  bytes[2] = 0x76;
  bytes[3] = 0x32;
  dv.setUint16(4, frameCount, true);
  dv.setUint16(6, 0, true);

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]!;
    const off = 8 + i * 10;
    dv.setInt16(off, run.tileId ?? -1, true);
    dv.setUint16(off + 2, run.wallId ?? 0, true);
    bytes[off + 4] = run.liquidType ?? 0;
    bytes[off + 5] = run.liquidAmount ?? 0;
    bytes[off + 6] = run.frameXHi ?? 0;
    bytes[off + 7] = run.flags ?? 0;
    dv.setUint16(off + 8, run.count, true);
  }

  if (frames) {
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]!;
      const off = 8 + runsBytes + i * 6;
      dv.setUint16(off, frame.runIndex, true);
      bytes[off + 2] = frame.frameXLo;
      bytes[off + 3] = 0;
      dv.setUint16(off + 4, frame.frameY, true);
    }
  }

  return btoa(String.fromCharCode(...bytes));
}

describe('decodeBase64RleV2', () => {
  it('T-V2-1: decodes tile_id, wall_id, liquid_type, liquid_amount from single run', () => {
    const payload = encodeV2([
      { tileId: 5, wallId: 2, liquidType: 1, liquidAmount: 200, count: 2 },
    ]);
    const result = decodeBase64RleV2(payload, 2, 1);
    expect(result.tileId[0]).toBe(5);
    expect(result.wallId[0]).toBe(2);
    expect(result.liquidType[0]).toBe(1);
    expect(result.liquidAmount[0]).toBe(200);
    expect(result.tileId[1]).toBe(5);
    expect(result.wallId[1]).toBe(2);
  });

  it('T-V2-2: reconstructs frame_x and frame_y from frame block', () => {
    // frameXHi=0x01, frameXLo=0x80 → frameX = (1<<8)|0x80 = 384, frameY=18, flags=0x01 (has_frame)
    const payload = encodeV2(
      [{ tileId: 3, flags: 0x01, frameXHi: 0x01, count: 1 }],
      [{ runIndex: 0, frameXLo: 0x80, frameY: 18 }]
    );
    const result = decodeBase64RleV2(payload, 1, 1);
    expect(result.frameX[0]).toBe(0x0180);
    expect(result.frameY[0]).toBe(18);
    expect(result.flags[0]).toBe(0x01);
  });

  it('T-V2-3: air tiles default to tileId=-1', () => {
    const payload = encodeV2([{ tileId: -1, count: 4 }]);
    const result = decodeBase64RleV2(payload, 2, 2);
    expect(Array.from(result.tileId)).toEqual([-1, -1, -1, -1]);
  });

  it('T-V2-4: empty payload returns all-air chunk', () => {
    const result = decodeBase64RleV2('', 2, 2);
    expect(Array.from(result.tileId)).toEqual([-1, -1, -1, -1]);
    expect(Array.from(result.wallId)).toEqual([0, 0, 0, 0]);
  });

  it('T-V2-5: invalid magic returns all-air chunk', () => {
    const bytes = new Uint8Array(18);
    bytes[0] = 0x00;
    const payload = btoa(String.fromCharCode(...bytes));
    const result = decodeBase64RleV2(payload, 1, 1);
    expect(result.tileId[0]).toBe(-1);
    expect(result.wallId[0]).toBe(0);
  });

  it('T-V2-6: flags byte preserved per tile', () => {
    const payload = encodeV2([{ flags: 0x06, count: 1 }]);
    const result = decodeBase64RleV2(payload, 1, 1);
    expect(result.flags[0]).toBe(0x06);
  });

  it('T-V2-7: multiple runs fill correct indices in row-major order', () => {
    // 2×2 chunk: run1 = tileId=10 count=2, run2 = tileId=20 count=2
    const payload = encodeV2([
      { tileId: 10, count: 2 },
      { tileId: 20, count: 2 },
    ]);
    const result = decodeBase64RleV2(payload, 2, 2);
    expect(result.tileId[0]).toBe(10);
    expect(result.tileId[1]).toBe(10);
    expect(result.tileId[2]).toBe(20);
    expect(result.tileId[3]).toBe(20);
  });

  it('T-V2-8: run with no frame entry leaves frameX=0, frameY=0 even when has_frame set', () => {
    // flags=0x01 but no frame block entry for this run
    const payload = encodeV2([{ flags: 0x01, count: 1 }]);
    const result = decodeBase64RleV2(payload, 1, 1);
    expect(result.frameX[0]).toBe(0);
    expect(result.frameY[0]).toBe(0);
  });
});

describe('decodeBase64RleV1 compat', () => {
  it('T-V1-COMPAT: output unchanged — tileId=1 ×2, tileId=-1 ×2', () => {
    const bytes = new Uint8Array(8);
    const dv = new DataView(bytes.buffer);
    dv.setInt16(0, 1, true);
    dv.setUint16(2, 2, true);
    dv.setInt16(4, -1, true);
    dv.setUint16(6, 2, true);
    const payload = btoa(String.fromCharCode(...bytes));
    const result = decodeBase64RleV1(payload, 2, 2);
    expect(Array.from(result)).toEqual([1, 1, -1, -1]);
  });
});

describe('decodeBase64RleV1AsV2 (IT-08, M09: unified render path)', () => {
  function encodeV1Runs(runs: Array<{ tileId: number; count: number }>): string {
    const bytes = new Uint8Array(runs.length * 4);
    const dv = new DataView(bytes.buffer);
    for (let i = 0; i < runs.length; i++) {
      dv.setInt16(i * 4, runs[i]!.tileId, true);
      dv.setUint16(i * 4 + 2, runs[i]!.count, true);
    }
    return btoa(String.fromCharCode(...bytes));
  }

  it('should produce a DecodedChunkV2 whose tileId matches the v1 decoder output', () => {
    const payload = encodeV1Runs([
      { tileId: 1, count: 2 },
      { tileId: -1, count: 2 },
    ]);
    const result = decodeBase64RleV1AsV2(payload, 2, 2);
    expect(Array.from(result.tileId)).toEqual(Array.from(decodeBase64RleV1(payload, 2, 2)));
  });

  it('should leave walls, liquids, frames and flags zeroed with the expected lengths', () => {
    const payload = encodeV1Runs([{ tileId: 7, count: 4 }]);
    const result = decodeBase64RleV1AsV2(payload, 2, 2);
    expect(result.wallId).toHaveLength(4);
    expect(result.liquidType).toHaveLength(4);
    expect(result.liquidAmount).toHaveLength(4);
    expect(result.frameX).toHaveLength(4);
    expect(result.frameY).toHaveLength(4);
    expect(result.flags).toHaveLength(4);
    expect(result.wallId.every((v) => v === 0)).toBe(true);
    expect(result.liquidType.every((v) => v === 0)).toBe(true);
    expect(result.flags.every((v) => v === 0)).toBe(true);
  });
});
