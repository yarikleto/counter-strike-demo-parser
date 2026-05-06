# TASK-066: Round tracker (per-round summary aggregation)

**Milestone:** 6 — Convenience & DX
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-040, TASK-038

**Goal:** Aggregate events into per-round summaries: kills, winner, end reason, MVP, bomb events, player stats for the round.

**Acceptance Criteria:**
- [ ] Round object: number, winner (Team), endReason, mvp (Player), startTick, endTick
- [ ] Round.kills: all kills that happened during this round
- [ ] Round.players: per-player round stats (kills, deaths, assists, damage, money spent)
- [ ] Round.bombEvents: plants, defuses, explosions during this round
- [ ] Handle overtime rounds and warmup exclusion

**Cycle:** developer (implements + tests) -> reviewer
