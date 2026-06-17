# TASK-016: SendTable flattening: prop collection + DT recursion

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-015

**Goal:** Implement the second step of SendTable flattening: collect all non-excluded, non-DataTable props by recursively walking the tree. DataTable props cause recursion into the referenced table.

**Acceptance Criteria:**
- [ ] Skip props that are in the exclusion set from TASK-015
- [ ] Skip DataTable-type props (they're structural, not data)
- [ ] For non-collapsible DataTable props, recurse into the referenced SendTable and append its flattened props
- [ ] Build a flat array of FlattenedSendProp (prop definition + source table name)
- [ ] Correct ordering: props appear in tree-walk order

**Cycle:** developer (implements + tests) -> reviewer
