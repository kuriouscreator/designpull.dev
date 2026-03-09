import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.test.js',
        '**/*.spec.js',
        '**/fixtures/**',
        'scripts/mcp-server.sh',
        'scripts/mcp-server.bat',
        'vitest.config.js',
      ],
      all: true,
      lines: 60,
      functions: 60,
      branches: 60,
      statements: 60,
    },
    include: ['test/**/*.test.js'],
    exclude: ['node_modules', 'dist', '.designpull'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
