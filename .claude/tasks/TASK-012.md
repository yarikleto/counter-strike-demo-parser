# TASK-012: Game enums (TeamSide, WeaponType, HitGroup)

**Milestone:** 1 — Foundation
**Status:** `DONE`
**Size:** S | **Type:** setup
**Depends on:** TASK-001

**Goal:** Define TypeScript enums for common game constants used throughout the parser.

**Acceptance Criteria:**
- [ ] `TeamSide` enum: Unassigned, Spectator, T, CT (matching CS:GO team numbers 0-3)
- [ ] `WeaponType` enum: Knife, Pistol, SMG, Rifle, Shotgun, MachineGun, Sniper, Grenade, C4, Equipment
- [ ] `HitGroup` enum: Generic, Head, Chest, Stomach, LeftArm, RightArm, LeftLeg, RightLeg, Gear

**Cycle:** developer (implements + tests) -> reviewer
