import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd()) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global.ts"],
    // Cada arquivo de teste roda em um processo próprio, com o seu próprio banco temporário.
    pool: "forks",
    testTimeout: 20_000,
  },
});
