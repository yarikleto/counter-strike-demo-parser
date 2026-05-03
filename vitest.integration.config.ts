import { defineConfig } from "vitest/config";

// Integration tests each call parser.parseAll() on de_nuke.dem, which
// blocks a worker for ~2-3s of pure CPU. Running multiple such workers
// in parallel starves vitest's worker-RPC heartbeat and produces
// false-positive "Timeout calling onTaskUpdate" failures.
//
// Run them strictly serially: one parse at a time, no RPC pressure.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    pool: "threads",
    poolOptions: {
      threads: {
        maxThreads: 1,
        minThreads: 1,
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
