# TASK-017: SendTable flattening: collapsible tables

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-016

**Goal:** Handle SPROP_COLLAPSIBLE DataTable props during flattening. Collapsible tables have their child props merged into the parent level instead of being recursed normally.

**Acceptance Criteria:**
- [ ] Detect SPROP_COLLAPSIBLE flag on DataTable-type props
- [ ] Merge child props directly into the current level (no nesting)
- [ ] Correct interaction with exclusions (excluded props in collapsible tables stay excluded)

**Cycle:** developer (implements + tests) -> reviewer
