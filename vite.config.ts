import { defineConfig } from 'vitest/config';

// Relative base so the build works both at a domain root and under the
// GitHub Pages project path (/moonlanders/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // three.js alone is ~550 kB minified; the game ships as a single chunk on purpose.
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
