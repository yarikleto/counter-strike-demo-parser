# TASK-015: SendTable flattening: exclusion gathering

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-013

**Goal:** Implement the first step of SendTable flattening: walk the SendTable tree and collect all SPROP_EXCLUDE props into an exclusion set.

**Acceptance Criteria:**
- [ ] Recursively walk SendTable hierarchy following DataTable-type props
- [ ] Collect all props with SPROP_EXCLUDE flag as (dtName, propName) pairs
- [ ] Return a set that can be checked during prop collection (TASK-016)

**Cycle:** developer (implements + tests) -> reviewer
