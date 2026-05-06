# TASK-018: SendTable flattening: priority sort

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-017

**Goal:** Apply the final step of SendTable flattening: sort the flattened prop list by priority value. This determines the decode order for entity property updates.

**Acceptance Criteria:**
- [ ] Props with SPROP_CHANGES_OFTEN flag get priority 64
- [ ] Sort all unique priorities, then for each priority level (ascending), move matching props to the front of the remaining unsorted portion
- [ ] Sort is stable: props with equal priority maintain their relative order
- [ ] Output is the final FlattenedSendProp[] used as the decode template for a ServerClass

**Cycle:** developer (implements + tests) -> reviewer
