# TASK-063: Grenade trajectory tracker

**Milestone:** 6 — Convenience & DX
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-041, TASK-026

**Goal:** Track grenade entities from spawn to detonation and build trajectory arrays with positions at each tick.

**Acceptance Criteria:**
- [ ] Detect grenade entity creation (CBaseCSGrenadeProjectile and subclasses)
- [ ] Track position (x/y/z) at each tick the grenade entity exists
- [ ] Match grenade entity to thrower via entity handle
- [ ] Build GrenadeTrajectory object: thrower (Player), type (smoke/flash/HE/molotov/decoy), trajectory (Vector3[]), detonationPosition
- [ ] Available in DemoResult.grenades after parse completes

**Cycle:** developer (implements + tests) -> reviewer
