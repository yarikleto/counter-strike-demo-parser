# TASK-056: Entity handle utility (index + serial extraction)

**Milestone:** 5 — Advanced Data
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-001

**Goal:** Utility functions for Source engine entity handle bit manipulation. Entity handles encode both entity index and serial number in a 32-bit integer.

**Acceptance Criteria:**
- [ ] `handleToIndex(handle)` extracts entity index from lower bits
- [ ] `handleToSerial(handle)` extracts serial from upper bits
- [ ] `isValidHandle(handle)` returns false for INVALID_EHANDLE_INDEX
- [ ] Constants exported: INDEX_BITS (11), SERIAL_BITS (10), INDEX_MASK, INVALID_EHANDLE_INDEX

**Cycle:** developer (implements + tests) -> reviewer
