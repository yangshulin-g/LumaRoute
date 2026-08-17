import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'player',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
