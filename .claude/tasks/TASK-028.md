# TASK-028: Player state overlay (CCSPlayer)

**Milestone:** 3 — Game State
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-026

**Goal:** Create a Player class that provides typed access to CCSPlayer entity properties. Maps raw entity property indices to meaningful named getters.

**Acceptance Criteria:**
- [ ] Player class wraps a CCSPlayer entity and exposes typed getters
- [ ] Core properties: name, health, armor, hasHelmet, hasDefuser, isAlive, team, position (x/y/z), angles (pitch/yaw/roll)
- [ ] Combat properties: kills, deaths, assists, score, mvps
- [ ] Economic properties: money, equipmentValue
- [ ] State properties: flashDuration, isScoped, isDefusing, isPlanting
- [ ] Property indices resolved once from flattened SendTable, then cached for O(1) access

**Cycle:** developer (implements + tests) -> reviewer
