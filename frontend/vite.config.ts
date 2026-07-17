import { defineConfig, type UserConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Única config de Vite Y Vitest (IT-18, M18/D07): el antiguo vitest.config.ts
// se eliminó — al existir, Vitest lo prefería y este bloque `test` quedaba
// muerto y divergente.
//
// Bajo Vitest el plugin react se omite: @vitejs/plugin-react@6 requiere
// vite@8 pero vitest@3 embebe vite@7 (decisión iter-007); el JSX de los tests
// lo transforma esbuild con runtime automático.
export default defineConfig({
  // Cast necesario: vitest/config tipa contra el vite@7 embebido de Vitest y
  // @vitejs/plugin-react@6 contra vite@8; en runtime dev/build usan vite@8 y
  // bajo Vitest el plugin ni se instancia.
  plugins: (process.env['VITEST'] ? [] : [react()]) as unknown as UserConfig['plugins'],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx,js,jsx}'],
  },
});
