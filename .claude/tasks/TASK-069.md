# TASK-069: API documentation and JSDoc polish

**Milestone:** 6 — Convenience & DX
**Status:** `TODO`
**Size:** M | **Type:** setup
**Depends on:** TASK-062

**Goal:** Add comprehensive JSDoc documentation to all public API surfaces. Every exported type, method, and property should have clear documentation.

**Acceptance Criteria:**
- [ ] DemoParser class: all public methods documented with @param, @returns, @example
- [ ] DemoResult and all its sub-types: every property documented
- [ ] All event types: JSDoc describing when they fire and what each field means
- [ ] All enums: each member documented
- [ ] TypeScript declaration output includes all JSDoc (verified in .d.ts)

**Cycle:** developer (implements + tests) -> reviewer
