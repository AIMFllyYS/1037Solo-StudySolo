import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export default defineConfig({
  root,
  resolve: { alias: { '@': root } },
  test: {
    environment: 'jsdom',
    include: ['docs/analysis/class-audit-2026-10-02/*.probe.tsx'],
    setupFiles: ['./tests/helpers/vitest-setup.ts'],
  },
})
