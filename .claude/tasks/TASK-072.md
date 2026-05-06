# TASK-072: BitReader V8 optimization pass

**Milestone:** 7 — Performance & Polish
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-071

**Goal:** Profile the BitReader hot path and optimize for V8. The BitReader processes millions of calls per demo — small improvements here have outsized impact.

**Acceptance Criteria:**
- [ ] Profile with --prof / --inspect to identify actual hot spots
- [ ] Minimize allocations in hot loops (no unnecessary objects, no closures in inner loops)
- [ ] Ensure monomorphic call sites (consistent argument types)
- [ ] Benchmark before/after: measurable improvement on de_dust2.dem
- [ ] No correctness regressions (all existing tests pass)

**Cycle:** developer (implements + tests) -> reviewer
