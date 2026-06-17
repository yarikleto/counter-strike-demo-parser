# TASK-071: Benchmark harness (parse time, memory, ops/sec)

**Milestone:** 7 — Performance & Polish
**Status:** `TODO`
**Size:** M | **Type:** setup
**Depends on:** TASK-062

**Goal:** Create a benchmark suite that measures parse performance: wall-clock time, peak memory, and throughput (MB/s) for the de_dust2.dem fixture.

**Acceptance Criteria:**
- [ ] Benchmark script in `scripts/benchmark.ts` runnable via `npm run bench`
- [ ] Measures: total parse time (ms), peak RSS (MB), throughput (MB/s)
- [ ] Runs multiple iterations and reports mean/median/p99
- [ ] Outputs results as JSON for tracking over time
- [ ] Baseline numbers recorded in a comment or markdown file

**Cycle:** developer (implements + tests) -> reviewer
