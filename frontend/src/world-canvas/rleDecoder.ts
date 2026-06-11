// Decodes a base64-rle-v1 payload: runs of (tileId: int16LE, count: uint16LE).
// Returns a flat Int16Array of length width*height in row-major order.
export function decodeBase64RleV1(payload: string, width: number, height: number): Int16Array {
  const tiles = new Int16Array(width * height);

  if (!payload) return tiles;

  const binaryStr = atob(payload);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const dv = new DataView(bytes.buffer);
  let writeIdx = 0;

  for (let offset = 0; offset + 3 < bytes.length; offset += 4) {
    const tileId = dv.getInt16(offset, true);
    const count = dv.getUint16(offset + 2, true);
    tiles.fill(tileId, writeIdx, writeIdx + count);
    writeIdx += count;
  }

  return tiles;
}

// Parallel arrays for a decoded v2 chunk — one entry per tile, row-major order.
export interface DecodedChunkV2 {
  tileId: Int16Array; // -1 = air
  wallId: Uint16Array; // 0 = no wall
  liquidType: Uint8Array; // 0=none 1=water 2=lava 3=honey 4=shimmer
  liquidAmount: Uint8Array;
  frameX: Uint16Array;
  frameY: Uint16Array;
  flags: Uint8Array; // bit 0=has_frame 1=actuator 2=wire_red 3=wire_blue 4=wire_green 5=wire_yellow
}

const MAGIC_0 = 0x54; // T
const MAGIC_1 = 0x57; // W
const MAGIC_2 = 0x76; // v
const MAGIC_3 = 0x32; // 2

export function decodeBase64RleV2(payload: string, width: number, height: number): DecodedChunkV2 {
  const total = width * height;
  const result: DecodedChunkV2 = {
    tileId: new Int16Array(total).fill(-1),
    wallId: new Uint16Array(total),
    liquidType: new Uint8Array(total),
    liquidAmount: new Uint8Array(total),
    frameX: new Uint16Array(total),
    frameY: new Uint16Array(total),
    flags: new Uint8Array(total),
  };

  if (!payload) return result;

  const binaryStr = atob(payload);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  if (
    bytes.length < 8 ||
    bytes[0] !== MAGIC_0 ||
    bytes[1] !== MAGIC_1 ||
    bytes[2] !== MAGIC_2 ||
    bytes[3] !== MAGIC_3
  ) {
    return result;
  }

  const dv = new DataView(bytes.buffer);
  const frameCount = dv.getUint16(4, true);
  const frameBlockSize = frameCount * 6;
  const runsEnd = bytes.length - frameBlockSize;

  // Build runIndex → { lo byte of frame_x, full frame_y }
  const frameMap = new Map<number, { lo: number; y: number }>();
  for (let i = 0; i < frameCount; i++) {
    const off = runsEnd + i * 6;
    if (off + 6 > bytes.length) break;
    const runIdx = dv.getUint16(off, true);
    const lo = dv.getUint8(off + 2);
    const fy = dv.getUint16(off + 4, true);
    frameMap.set(runIdx, { lo, y: fy });
  }

  let writeIdx = 0;
  let runIndex = 0;

  for (let offset = 8; offset + 10 <= runsEnd; offset += 10) {
    const tileId = dv.getInt16(offset, true);
    const wallId = dv.getUint16(offset + 2, true);
    const liquidType = dv.getUint8(offset + 4);
    const liquidAmount = dv.getUint8(offset + 5);
    const frameXHi = dv.getUint8(offset + 6);
    const flags = dv.getUint8(offset + 7);
    const count = dv.getUint16(offset + 8, true);

    let frameX = 0;
    let frameY = 0;
    if ((flags & 0x01) !== 0) {
      const entry = frameMap.get(runIndex);
      if (entry !== undefined) {
        frameX = (frameXHi << 8) | entry.lo;
        frameY = entry.y;
      }
    }

    const end = Math.min(writeIdx + count, total);
    for (let i = writeIdx; i < end; i++) {
      result.tileId[i] = tileId;
      result.wallId[i] = wallId;
      result.liquidType[i] = liquidType;
      result.liquidAmount[i] = liquidAmount;
      result.frameX[i] = frameX;
      result.frameY[i] = frameY;
      result.flags[i] = flags;
    }
    writeIdx = end;
    runIndex++;
  }

  return result;
}
