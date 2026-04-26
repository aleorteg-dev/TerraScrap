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
