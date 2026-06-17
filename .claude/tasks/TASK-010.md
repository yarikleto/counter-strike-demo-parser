# TASK-010: ServerInfo message handling

**Milestone:** 1 — Foundation
**Status:** `DONE`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-009

**Goal:** Handle CSVCMsg_ServerInfo and extract server metadata (max classes, tick interval, map name) needed by later parsing stages.

**Acceptance Criteria:**
- [ ] Extracts maxClasses, tickInterval, mapName, gameDir, skyName from ServerInfo
- [ ] Stores values for use by entity system (maxClasses determines ClassInfo table size)
- [ ] Emits a typed `serverInfo` event with extracted data

**Cycle:** developer (implements + tests) -> reviewer
