# TASK-037: Game event value decoding (GameEvent)

**Milestone:** 4 — Events
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-036

**Goal:** Decode CSVCMsg_GameEvent messages using the descriptor table. Produce typed event objects with named key-value pairs.

**Acceptance Criteria:**
- [ ] Look up descriptor by event ID from GameEventList
- [ ] Decode each key value based on its type (string, float, long, short, byte, bool, uint64)
- [ ] Produce a plain object with key names mapped to decoded values
- [ ] Emit raw game event with event name and decoded data
- [ ] Handle unknown event IDs gracefully (log warning, skip)

**Cycle:** developer (implements + tests) -> reviewer
