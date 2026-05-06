# TASK-020: Property decoder: Float (all sub-encodings)

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-007, TASK-018

**Goal:** Implement the Float property decoder with all its sub-encodings. Floats have the most complex decoding logic due to the many flag-driven encoding variants.

**Acceptance Criteria:**
- [ ] Dispatches to correct sub-decoder based on SendProp flags (COORD, COORD_MP, NOSCALE, NORMAL, CELL_COORD, default quantized)
- [ ] Quantized float: reads numBits, interpolates between lowValue and highValue, handles ROUNDDOWN/ROUNDUP flags
- [ ] All coordinate variants (COORD, COORD_MP, COORD_MP_LOWPRECISION, COORD_MP_INTEGRAL) correctly decoded
- [ ] Cell coordinate variants (CELL_COORD, CELL_COORD_LOWPRECISION, CELL_COORD_INTEGRAL) correctly decoded
- [ ] NOSCALE reads raw 32-bit IEEE float
- [ ] NORMAL reads 11-bit encoded normal

**Cycle:** developer (implements + tests) -> reviewer
