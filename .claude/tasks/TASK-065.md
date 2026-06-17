# TASK-065: Damage matrix

**Milestone:** 6 — Convenience & DX
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-038

**Goal:** Build a damage matrix from player_hurt events: who damaged whom, total damage, hit count, weapons used.

**Acceptance Criteria:**
- [ ] Accumulate damage from playerHurt events across the match
- [ ] DamageEntry: attacker (Player), victim (Player), totalDamage, totalArmorDamage, hitCount, weapons (Map<string, number>), hitGroups (Map<HitGroup, number>)
- [ ] Expose as a lookup: `damageMatrix.get(attacker, victim)` returns DamageEntry
- [ ] Available per-round and for the full match

**Cycle:** developer (implements + tests) -> reviewer
