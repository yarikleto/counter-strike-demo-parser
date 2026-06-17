# TASK-034: Round state tracking

**Milestone:** 3 — Game State
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-033

**Goal:** Track round state transitions (freeze time, live, over) and maintain a round counter that increments correctly across the match.

**Acceptance Criteria:**
- [ ] Detect round transitions from GameRules property changes
- [ ] Track current round number, round phase (freeze, live, over)
- [ ] Emit `roundStateChanged` parser event when phase transitions
- [ ] Handle edge cases: warmup rounds, knife rounds, overtime

**Cycle:** developer (implements + tests) -> reviewer
