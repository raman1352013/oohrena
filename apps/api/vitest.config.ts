import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Reuse the MongoDB test binary cached at the monorepo root instead of re-downloading per workspace.
process.env.MONGOMS_DOWNLOAD_DIR ??= fileURLToPath(new URL("../../node_modules/.cache/mongodb-memory-server", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Each file starts its own in-memory replica set; keep files sequential to save memory.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
