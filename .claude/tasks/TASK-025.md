# TASK-025: Instance baseline decoding

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-022, TASK-021

**Goal:** Decode instance baselines from the `instancebaseline` string table. Baselines contain default property values for each ServerClass, decoded using the same property decoders as entity updates.

**Acceptance Criteria:**
- [ ] Watch for `instancebaseline` string table entries (key = classId as string, value = property data)
- [ ] Decode baseline property data using the ServerClass's flattened prop list and property decoders
- [ ] Cache decoded baselines per classId for use during entity creation
- [ ] Handle the case where baselines arrive before or after ClassInfo (lazy decode on first use)
- [ ] Baselines are correctly applied as the starting state for newly created entities

**Cycle:** developer (implements + tests) -> reviewer
