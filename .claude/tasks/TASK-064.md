# TASK-064: Economy tracker (money per player per round)

**Milestone:** 6 — Convenience & DX
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-028, TASK-040

**Goal:** Track per-player economy across rounds: start money, purchases, end money, equipment value.

**Acceptance Criteria:**
- [ ] Capture player money at round start (freeze time begin)
- [ ] Track item purchases during buy time (from item_purchase events)
- [ ] Capture player money at round end
- [ ] Build per-round economy data: player, startMoney, endMoney, purchases[], equipmentValue
- [ ] Available in DemoResult.rounds[].players[].economy after parse completes

**Cycle:** developer (implements + tests) -> reviewer
