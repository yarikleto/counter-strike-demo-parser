# TASK-007: Float decoders (coord, normal, cell, quantized)

**Milestone:** 1 — Foundation
**Status:** `DONE`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-005

**Goal:** Implement all Source engine float decoding methods on BitReader. These are used by entity property decoders and must match Valve's encoding exactly.

**Acceptance Criteria:**
- [ ] `readBitCoord()` — fractional coordinate encoding (integer + fraction parts)
- [ ] `readBitCoordMP()` — multiplayer optimized coordinate (integral, low-precision, and full variants)
- [ ] `readBitNormal()` — 11-bit encoded normal component (-1 to 1 range)
- [ ] `readBitCellCoord(bits)` — cell coordinate with configurable bit width (integral, low-precision, full)
- [ ] `readBitFloat()` — raw 32-bit IEEE 754 float
- [ ] `readBitAngle(bits)` — angle encoded in N bits

**Cycle:** developer (implements + tests) -> reviewer
