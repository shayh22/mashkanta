import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The engine is pure computation with no DOM dependency, so it runs in plain node.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
