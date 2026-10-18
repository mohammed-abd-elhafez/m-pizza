import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**", "../staff-web/public/js/logic.js", "../staff-web/public/js/api.js"],
      exclude: ["src/server.ts", "src/cli/**", "src/application/*-ports.ts", "src/application/ports.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});