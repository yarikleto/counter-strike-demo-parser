# TASK-035: Server info state

**Milestone:** 3 — Game State
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-010

**Goal:** Aggregate server information from the ServerInfo message and demo header into a single typed ServerInfo object accessible on the parser.

**Acceptance Criteria:**
- [ ] ServerInfo type combining header data (map, protocol, playback time) and ServerInfo message data (tick interval, max classes)
- [ ] Computed properties: tickRate (1/tickInterval), isGOTV (detected from header)
- [ ] Accessible as `parser.serverInfo` after header + ServerInfo are parsed

**Cycle:** developer (implements + tests) -> reviewer
