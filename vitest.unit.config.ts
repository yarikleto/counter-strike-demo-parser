import { defineConfig } from "vitest/config";

// Unit tests are CPU-cheap and parallel-safe. Use vitest's default
// thread pool with no maxThreads override so the suite saturates
// available cores.
export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts"],
    testTimeout: 10000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**"],
    },
  },
});
