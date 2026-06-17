# TASK-021: Property decoder: Vector, VectorXY, String, Array

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-019, TASK-020

**Goal:** Implement property decoders for the remaining types: Vector (3D), VectorXY (2D with computed Z), String, and Array.

**Acceptance Criteria:**
- [ ] DPT_Vector: reads three float values using the float decoder
- [ ] DPT_VectorXY: reads two floats (X, Y), computes Z from NORMAL encoding if applicable
- [ ] DPT_String: reads length (max 512) then reads that many bytes as UTF-8 string
- [ ] DPT_Array: reads element count (log2(numElements) bits), then decodes each element using the array element prop definition
- [ ] All decoders registered in a dispatcher that selects by SendProp type

**Cycle:** developer (implements + tests) -> reviewer
