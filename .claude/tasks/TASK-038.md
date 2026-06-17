# TASK-038: Combat and player action events

**Milestone:** 4 — Events
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-037, TASK-028

**Goal:** Emit typed events for combat, kills, damage, and high-value player actions that competitive analysts depend on.

**Acceptance Criteria:**
- [ ] `playerDeath` event with: attacker (Player | undefined for world), victim (Player), assister (Player | undefined), weapon (string), headshot (boolean), penetrated (boolean), noscope (boolean), thrusmoke (boolean), attackerblind (boolean)
- [ ] `playerHurt` event with: attacker, victim, weapon, damage, damageArmor, hitGroup (HitGroup enum), healthRemaining, armorRemaining
- [ ] `playerBlind` event with: player (Player), attacker (Player), blindDuration (number)
- [ ] `playerSpawned` event with: player (Player), inRestart (boolean)
- [ ] `playerGivenC4` event with: player (Player)
- [ ] `bulletImpact` event with: player (Player), position (x/y/z)
- [ ] `otherDeath` event with: attacker (Player | undefined), entityType (string), weapon (string)
- [ ] Player references resolved from userids in the raw game event
- [ ] Handles edge cases: suicide (attacker === victim), world damage (attacker undefined)

**Context (2026-04-07):** Expanded from original 2-event scope (player_death, player_hurt) to include player_blind, player_spawned, player_given_c4, bullet_impact, and other_death. These are all high-value for competitive analysis: flash effectiveness, spawn tracking, C4 carrier identification, and bullet trajectory analysis. See `.claude/research/csgo-events-complete.md` for the full 169-event reference.

**Cycle:** developer (implements + tests) -> reviewer
