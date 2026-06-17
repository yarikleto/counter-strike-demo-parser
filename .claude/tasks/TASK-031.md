# TASK-031: Weapon state overlay

**Milestone:** 3 — Game State
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-026, TASK-028

**Goal:** Create a Weapon class for weapon entities, and link weapons to their owning players via entity handles.

**Acceptance Criteria:**
- [ ] Weapon class with typed getters: type (WeaponType enum), name, clipAmmo, reserveAmmo, owner (Player reference)
- [ ] Detect weapon entities by ServerClass name (CWeapon*, CAK47, CDEagle, etc.)
- [ ] Resolve weapon owner via entity handle (m_hOwner property)
- [ ] Player.weapons returns array of Weapon objects; Player.activeWeapon returns the currently held weapon

**Cycle:** developer (implements + tests) -> reviewer
