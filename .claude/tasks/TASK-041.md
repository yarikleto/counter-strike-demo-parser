# TASK-041: Grenade events (throw, bounce, and all detonations)

**Milestone:** 4 — Events
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-037

**Goal:** Emit typed events for all grenade lifecycle stages: throw, bounce, and detonation for all grenade types.

**Acceptance Criteria:**
- [ ] `grenadeThrown` event with: thrower (Player), weapon (string)
- [ ] `grenadeBounce` event with: thrower (Player)
- [ ] `heGrenadeDetonate` event with: thrower (Player), position (x/y/z)
- [ ] `flashbangDetonate` event with: thrower (Player), position (x/y/z), playersFlashed (Player[])
- [ ] `smokeGrenadeDetonate` / `smokeGrenadeExpired` events with: thrower, position
- [ ] `molotovDetonate` / `infernoExpired` events with: thrower, position
- [ ] `decoyDetonate` event with: thrower, position

**Context (2026-04-07):** Added grenadeThrown and grenadeBounce. The grenade tracker (TASK-063) needs these for trajectory building.

**Cycle:** developer (implements + tests) -> reviewer
