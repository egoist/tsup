import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 50000,
    globalSetup: 'vitest-global.ts',
    include: ['test/*.test.ts', 'src/**/*.test.ts'],
  },
})
