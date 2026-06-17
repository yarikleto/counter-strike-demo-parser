# TASK-074: Entity system memory optimization

**Milestone:** 7 — Performance & Polish
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-071

**Goal:** Reduce memory allocations in the entity system. Focus on entity creation/deletion churn and property array management.

**Acceptance Criteria:**
- [ ] Profile heap allocations during a full parse
- [ ] Reuse entity objects from a pool when entities are deleted and recreated at the same ID
- [ ] Pre-allocate property arrays to the correct size (from flattened prop count)
- [ ] Benchmark memory: measurable reduction in peak RSS

**Cycle:** developer (implements + tests) -> reviewer
