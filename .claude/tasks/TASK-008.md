# TASK-008: String and byte-array decoders

**Milestone:** 1 — Foundation
**Status:** `DONE`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-005

**Goal:** Add string and byte-array reading to BitReader for use by property decoders and string tables.

**Acceptance Criteria:**
- [ ] `readString(maxLength?)` — reads a null-terminated string from bit stream (default max 512 chars)
- [ ] `readBytes(count)` — reads N bytes from bit-aligned position, returns Buffer

**Cycle:** developer (implements + tests) -> reviewer
