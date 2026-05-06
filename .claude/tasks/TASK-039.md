# TASK-039: Bomb events (full lifecycle)

**Milestone:** 4 — Events
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-037

**Goal:** Emit typed bomb-related events covering the full plant/defuse lifecycle with player references and site information.

**Acceptance Criteria:**
- [ ] `bombPlanted` event with: player (Player), site (number)
- [ ] `bombDefused` event with: player (Player), site (number)
- [ ] `bombExploded` event with: site (number)
- [ ] `bombPickedUp` event with: player (Player)
- [ ] `bombDropped` event with: player (Player), entityIndex (number)
- [ ] `bombBeginPlant` event with: player (Player), site (number)
- [ ] `bombAbortPlant` event with: player (Player), site (number)
- [ ] `bombBeginDefuse` event with: player (Player), hasKit (boolean)
- [ ] `bombAbortDefuse` event with: player (Player)

**Context (2026-04-07):** Expanded from 5 events to full 9-event bomb lifecycle. Analysts building plant/defuse timing tools need beginplant, abortplant, begindefuse, abortdefuse.

**Cycle:** developer (implements + tests) -> reviewer
