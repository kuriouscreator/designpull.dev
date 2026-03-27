import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.test.js',
        '**/*.spec.js',
        '**/fixtures/**',
        'vitest.config.js',
      ],
      all: true,
    },
    include: ['test/**/*.test.js'],
    exclude: ['node_modules', 'dist', '.designpull'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
