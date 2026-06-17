# TASK-084: Native property decoder (C++ N-API)

**Milestone:** 7 — Performance & Polish
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-083

**Goal:** Implement the property decoder in C++ to decode entity property updates entirely in native code, avoiding JS/C++ boundary crossing per property.

**Acceptance Criteria:**
- [ ] C++ property decoder handles all property types (Int, Float, Vector, VectorXY, String, Array, Int64)
- [ ] Batch API: decode all changed properties for an entity update in a single native call
- [ ] Returns decoded values as a JavaScript array
- [ ] All existing property decoder tests pass against native implementation
- [ ] End-to-end parse benchmark shows measurable improvement (target: 2x overall parse speed)

**Cycle:** developer (implements + tests) -> reviewer
