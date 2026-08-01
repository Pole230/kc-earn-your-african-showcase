import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['<rootDir>/test/setupTests.ts'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'lcov'],
    },
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
