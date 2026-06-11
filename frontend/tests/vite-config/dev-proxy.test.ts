// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { UserConfig, ProxyOptions } from 'vite';
import config from '../../vite.config';

describe('vite.config dev proxy', () => {
  it('server.proxy["/api"].target === "http://localhost:8000"', () => {
    const { server } = config as UserConfig;
    const proxy = server?.proxy as Record<string, ProxyOptions> | undefined;
    expect(proxy).toBeDefined();
    expect(proxy?.['/api']?.target).toBe('http://localhost:8000');
  });

  it('server.proxy["/api"].changeOrigin is true', () => {
    const { server } = config as UserConfig;
    const proxy = server?.proxy as Record<string, ProxyOptions> | undefined;
    expect(proxy?.['/api']?.changeOrigin).toBe(true);
  });
});
