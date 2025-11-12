import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      '__tests__/*.test.ts', 
      '__tests__/*.test.tsx',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx'
    ],
    exclude: [
      'services/__tests__/**',
      'components/__tests__/**',
      '**/node_modules/**'
    ],
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['services/**/*.ts', 'components/**/*.tsx'],
      exclude: [
        '**/*.test.ts', 
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        'node_modules/**',
        'tests/**',
        '__tests__/**',
        '**/types.ts',
        'vite.config.ts',
        'vitest.config.ts',
      ],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@services': path.resolve(__dirname, './services'),
      '@components': path.resolve(__dirname, './components'),
      '@types': path.resolve(__dirname, './types'),
    },
  },
});
