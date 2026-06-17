# TASK-026: Entity creation + update (PacketEntities)

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-021, TASK-025

**Goal:** Handle CSVCMsg_PacketEntities message. Process the bit-packed entity data stream to create new entities (with baseline + delta), update existing entities (delta only), and track all entities in an EntityList.

**Acceptance Criteria:**
- [ ] Read entity headers: index delta (varint) + 2-bit operation code
- [ ] Create operation: read classId, serial, apply baseline, then apply create delta
- [ ] Update operation: read changed property indices using "new way" encoding, decode each changed property
- [ ] EntityList stores entities indexed by entity ID (0-2047), O(1) access
- [ ] Emits `entityCreated` and `entityUpdated` events with entity reference
- [ ] Entity property values stored in flat array indexed by flattened prop index

**Cycle:** developer (implements + tests) -> reviewer
