import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom does not implement canvas rendering. Provide a spy-able mock so tests
// can assert on clearRect/fillRect without needing the native canvas package.
const mockCtx: Partial<CanvasRenderingContext2D> = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  drawImage: vi.fn() as unknown as CanvasRenderingContext2D['drawImage'],
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  setLineDash: vi.fn(),
};

HTMLCanvasElement.prototype.getContext = vi
  .fn()
  .mockReturnValue(mockCtx) as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((callback: BlobCallback) => {
  callback(new Blob(['mock-png'], { type: 'image/png' }));
}) as typeof HTMLCanvasElement.prototype.toBlob;
