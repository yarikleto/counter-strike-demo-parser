import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    // Integration tests each parse de_nuke.dem end-to-end (~2-3s of CPU).
    // With unlimited parallelism, vitest's worker-RPC layer occasionally
    // times out ("Timeout calling onTaskUpdate") because each worker is
    // CPU-bound for seconds at a time and can't service the RPC heartbeat.
    // Capping the pool to 4 workers + a forgiving test timeout removes the
    // cascade without sacrificing throughput on smaller machines.
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
