# TASK-073: Property decoder optimization pass

**Milestone:** 7 — Performance & Polish
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-071

**Goal:** Optimize property decoders based on profiling data. Focus on the most commonly called decoders (Int, Float) and the property index reading hot path.

**Acceptance Criteria:**
- [ ] Profile to identify which decoder types consume the most time
- [ ] Optimize top decoders: reduce branching, inline small functions, use lookup tables
- [ ] Benchmark before/after: measurable improvement

**Cycle:** developer (implements + tests) -> reviewer
