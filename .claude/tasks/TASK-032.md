# TASK-032: Entity handle resolution utility

**Milestone:** 3 — Game State
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-026

**Goal:** Utility functions for working with Source engine entity handles (32-bit encoded entity index + serial number).

**Acceptance Criteria:**
- [ ] `handleToIndex(handle)` extracts entity index (lower bits)
- [ ] `handleToSerial(handle)` extracts serial number (upper bits)
- [ ] `isValidHandle(handle)` checks for the invalid handle sentinel value
- [ ] Constants: INVALID_HANDLE, INDEX_BITS, SERIAL_BITS

**Cycle:** developer (implements + tests) -> reviewer
