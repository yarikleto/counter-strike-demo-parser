# TASK-046: Miscellaneous game state events

**Milestone:** 4 — Events
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-037

**Goal:** Emit typed events for match-level state changes and miscellaneous game events not covered by other categories.

**Acceptance Criteria:**
- [ ] `beginNewMatch` event (no payload, signals match start)
- [ ] `roundMvp` event with: player (Player), reason (number)
- [ ] `announcePhaseEnd` event
- [ ] `csWinPanelMatch` event (match end panel)
- [ ] `csWinPanelRound` event with: finalEvent, funFactToken, funFactPlayer, funFactData
- [ ] `matchEndConditions` event with: frags, maxRounds, winRounds, time
- [ ] `botTakeover` event with: player (Player), botId (number)

**Context (2026-04-07):** Added csWinPanelRound, matchEndConditions, botTakeover. These are the most useful game state events for match result extraction.

**Cycle:** developer (implements + tests) -> reviewer
