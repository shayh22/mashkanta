import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The engine is pure computation with no DOM dependency, so it runs in plain node. Component
    // tests (*.test.tsx) run in jsdom.
    environment: 'node',
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
