# TASK-013: SendTable parsing

**Milestone:** 2 — Core Protocol
**Status:** `DONE`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-009

**Goal:** Parse CSVCMsg_SendTable messages into typed SendTable and SendProp data structures. These define the schema for every entity in the game.

**Acceptance Criteria:**
- [ ] SendTable type with name and array of SendProp definitions
- [ ] SendProp type with all fields: name, type (enum), flags (bitfield), numBits, lowValue, highValue, numElements, dtName
- [ ] Parse all SendTable messages from dem_datatables frame until `is_end` flag
- [ ] Store all parsed SendTables indexed by name for flattening phase

**Cycle:** developer (implements + tests) -> reviewer
