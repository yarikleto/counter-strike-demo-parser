# TASK-027: Entity deletion + PVS handling

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-026

**Goal:** Handle entity deletion and PVS (Potentially Visible Set) transitions in PacketEntities processing.

**Acceptance Criteria:**
- [ ] Delete operation: mark entity as deleted, free slot for reuse
- [ ] Leave PVS operation: mark entity as dormant (still exists but not being updated)
- [ ] Emits `entityDeleted` event with entity ID and class info
- [ ] EntityList correctly tracks active vs dormant vs deleted state

**Cycle:** developer (implements + tests) -> reviewer
