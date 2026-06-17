# TASK-029: PlayerResource overlay (CCSPlayerResource)

**Milestone:** 3 — Game State
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-028

**Goal:** Parse the CCSPlayerResource entity which holds per-player arrays of stats (kills, deaths, assists, score, MVPs, etc.) indexed by player slot. Some player stats come from here rather than the individual CCSPlayer entity.

**Acceptance Criteria:**
- [ ] Detect CCSPlayerResource entity creation
- [ ] Extract array-indexed properties: kills[], deaths[], assists[], score[], mvps[], teamNum[], connected[], health[], armor[]
- [ ] Map array indices to player slots and merge data into Player objects
- [ ] Handle the per-slot array encoding (properties named like `m_iKills.001`, `m_iKills.002`, etc.)

**Cycle:** developer (implements + tests) -> reviewer
