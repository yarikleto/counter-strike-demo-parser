# TASK-006: Integer decoders (varint, signed, unsigned)

**Milestone:** 1 — Foundation
**Status:** `DONE`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-005

**Goal:** Extend BitReader with Source engine-specific integer decoding: unsigned varint32, signed varint32, and the specific bit-packed integer format used by entity properties.

**Acceptance Criteria:**
- [ ] `readVarInt32()` decodes unsigned variable-length 32-bit integers
- [ ] `readSignedVarInt32()` decodes signed (zigzag-encoded) variable-length 32-bit integers
- [ ] Correct handling of edge cases: zero, max value, negative values

**Cycle:** developer (implements + tests) -> reviewer
