import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // The ledger and payment tests run against a real PostgreSQL database, so
    // they must not run concurrently against the same rows.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
