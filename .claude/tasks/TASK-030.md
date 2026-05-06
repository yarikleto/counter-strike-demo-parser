# TASK-030: Team state overlay (CCSTeam)

**Milestone:** 3 — Game State
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-026

**Goal:** Create a Team class that provides typed access to CCSTeam entity properties. Two team entities exist: CT and T.

**Acceptance Criteria:**
- [ ] Team class wraps CCSTeam entity with typed getters: name, score, side (CT/T/Spectator/Unassigned)
- [ ] Track team entity IDs and map them to TeamSide enum
- [ ] Expose list of players on each team (resolved via player team property)

**Cycle:** developer (implements + tests) -> reviewer
