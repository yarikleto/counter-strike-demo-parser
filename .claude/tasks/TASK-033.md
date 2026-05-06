# TASK-033: GameRules overlay (CCSGameRulesProxy)

**Milestone:** 3 — Game State
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-026

**Goal:** Create a GameRules class that extracts game state from the CCSGameRulesProxy entity: round number, phase, freeze time, round time, match phase, bomb state.

**Acceptance Criteria:**
- [ ] Detect CCSGameRulesProxy entity
- [ ] Extract: roundNumber, gamePhase, freezeTimeEnd, roundStartTime, roundEndTime
- [ ] Extract: isBombPlanted, isBombDropped, bombSite (A/B)
- [ ] Extract: isWarmup, isMatchStarted, isFreezePeriod, hasMatchStarted
- [ ] Expose as typed getters on GameRules class

**Cycle:** developer (implements + tests) -> reviewer
