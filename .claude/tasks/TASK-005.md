# TASK-005: BitReader core

**Milestone:** 1 — Foundation
**Status:** `DONE`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-002

**Goal:** A BitReader class that reads individual bits and bit-packed values from a byte buffer. This is the hottest code path in the entire parser — correctness and V8 friendliness matter.

**Acceptance Criteria:**
- [ ] Reads individual bits (0 or 1)
- [ ] Reads N bits as unsigned integer (up to 32 bits)
- [ ] Reads N bits as signed integer (two's complement)
- [ ] Reads variable-length integers (varint encoding as used in Source engine)
- [ ] Reads raw bytes from bit-aligned position
- [ ] Tracks bit position and remaining bits, supports seeking
- [ ] All operations are correct at non-byte-aligned boundaries

**Cycle:** developer (implements + tests) -> reviewer
