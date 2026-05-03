import { defineConfig } from "vitest/config";

// Default config used by `npx vitest` and IDE integrations. The
// preferred path for CLI is `npm run test`, which invokes the unit and
// integration configs in sequence (see package.json). This default
// keeps the union under a maxThreads cap so ad-hoc runs don't trigger
// the worker-RPC cascade that motivated the split.
export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    pool: "threads",
    poolOptions: {
      threads: {
        maxThreads: 4,
      },
    },
    testTimeout: 60000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**"],
    },
  },
});
