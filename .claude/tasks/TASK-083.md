# TASK-083: Native BitReader (C++ N-API)

**Milestone:** 7 — Performance & Polish
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-082

**Goal:** Implement the BitReader in C++ via N-API as a drop-in replacement for the TypeScript BitReader. Same API, faster execution.

**Acceptance Criteria:**
- [ ] C++ BitReader with all methods matching the TypeScript API (readBit, readBits, readVarInt, readBitCoord, readBitFloat, etc.)
- [ ] N-API bindings expose the BitReader to JavaScript
- [ ] All existing BitReader unit tests pass against the native implementation
- [ ] Measurable speedup over pure TS on benchmark (target: 2-3x for BitReader-heavy operations)

**Cycle:** developer (implements + tests) -> reviewer
