# TASK-019: Property decoder: Int + Int64

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-006, TASK-018

**Goal:** Implement property value decoders for integer types (DPT_Int and DPT_Int64).

**Acceptance Criteria:**
- [ ] DPT_Int: reads numBits bits, handles SPROP_UNSIGNED flag, handles SPROP_VARINT flag
- [ ] DPT_Int64: reads as two 32-bit parts or as varint depending on SPROP_VARINT flag
- [ ] Correct sign extension for signed integers
- [ ] Tested with edge cases: zero, max positive, max negative, single-bit values

**Cycle:** developer (implements + tests) -> reviewer
