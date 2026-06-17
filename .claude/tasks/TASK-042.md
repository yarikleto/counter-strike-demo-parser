# TASK-042: Player events (connect, disconnect, team change)

**Milestone:** 4 — Events
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-037, TASK-028

**Goal:** Emit typed events for player connection lifecycle and team changes.

**Acceptance Criteria:**
- [ ] `playerConnect` event with: name, steamId, userId, isBot
- [ ] `playerDisconnect` event with: player (Player), reason
- [ ] `playerTeamChange` event with: player (Player), oldTeam (TeamSide), newTeam (TeamSide)

**Cycle:** developer (implements + tests) -> reviewer
