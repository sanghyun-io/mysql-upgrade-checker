import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/scripts/**/*.ts'],
      exclude: ['src/scripts/**/*.test.ts', 'src/scripts/**/*.spec.ts']
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});
