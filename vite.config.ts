import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: { testTimeout: 120_000 },
} as any);
