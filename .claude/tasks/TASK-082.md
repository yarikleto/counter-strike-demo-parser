# TASK-082: Native C++ addon spike (N-API setup)

**Milestone:** 7 — Performance & Polish
**Status:** `TODO`
**Size:** M | **Type:** setup
**Depends on:** TASK-005

**Goal:** Prove the native C++ addon approach works: set up N-API build toolchain, create a trivial native function callable from TypeScript, verify the build/test/fallback cycle.

**Acceptance Criteria:**
- [ ] `binding.gyp` and C++ source file in `native/` directory
- [ ] N-API addon compiles and loads in Node.js 22+
- [ ] Trivial test function (e.g., add two numbers) callable from TypeScript
- [ ] Fallback mechanism: if native module fails to load, gracefully fall back to pure TS
- [ ] Build instructions documented

**Cycle:** developer (implements + tests) -> reviewer
