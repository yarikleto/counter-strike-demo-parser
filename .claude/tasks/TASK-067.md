# TASK-067: Player position snapshots

**Milestone:** 6 — Convenience & DX
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-028

**Goal:** Collect player positions at configurable tick intervals for heatmap and movement analysis use cases.

**Acceptance Criteria:**
- [ ] Capture player positions at each tick (or configurable interval)
- [ ] PositionSnapshot: tick, player (Player reference), x, y, z
- [ ] Available in DemoResult.playerPositions after parse completes
- [ ] Configurable sample rate to control memory usage (e.g., every N ticks)

**Cycle:** developer (implements + tests) -> reviewer
