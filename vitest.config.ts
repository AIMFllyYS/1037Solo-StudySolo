import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url))),
    },
  },
  test: {
    environment: "jsdom",
    include: ["**/*.test.tsx"],
    exclude: [".local-archive/**", "1037Solo-Classolo/**", "1037Solo-StudySolo/**", "node_modules/**", ".next/**", "build/**", "dist/**", "dist-desktop/**"],
    setupFiles: ["./tests/helpers/vitest-setup.ts"],
    globals: true,
  },
});
