# TASK-052: Model precache string table

**Milestone:** 5 — Advanced Data
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-022

**Goal:** Parse the `modelprecache` string table and expose model names for entity model index resolution.

**Acceptance Criteria:**
- [ ] Detect and parse `modelprecache` string table entries
- [ ] Expose a lookup: modelIndex -> modelName (e.g., "models/player/ct_fbi.mdl")
- [ ] Used by entity system to resolve what model an entity is using

**Cycle:** developer (implements + tests) -> reviewer
