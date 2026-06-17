# TASK-040: Round events (full lifecycle)

**Milestone:** 4 — Events
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-037, TASK-034

**Goal:** Emit typed round lifecycle events with context from game state.

**Acceptance Criteria:**
- [ ] `roundStart` event with: timeLimit, fragLimit, objective
- [ ] `roundEnd` event with: winner (TeamSide), reason (enum), message
- [ ] `roundFreezeEnd` event (signals buy time is over, round is live)
- [ ] `roundPrestart` event (signals round is about to begin)
- [ ] `roundPoststart` event (signals round setup is complete)
- [ ] Round number available on all round events from round state tracker

**Context (2026-04-07):** Added roundPrestart and roundPoststart for complete round lifecycle bracketing.

**Cycle:** developer (implements + tests) -> reviewer
