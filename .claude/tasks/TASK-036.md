# TASK-036: Game event descriptor parsing (GameEventList)

**Milestone:** 4 — Events
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-009

**Goal:** Parse CSVCMsg_GameEventList message and build a descriptor table that maps event IDs to event names and their key definitions (name + type).

**Acceptance Criteria:**
- [ ] Parse GameEventList into a Map of event ID -> EventDescriptor
- [ ] EventDescriptor contains: eventId, name, keys[] where each key has name and type (string/float/long/short/byte/bool/uint64)
- [ ] Store descriptors for use by GameEvent decoder (TASK-037)

**Cycle:** developer (implements + tests) -> reviewer
