# TASK-045: Hostage events

**Milestone:** 4 — Events
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-037

**Goal:** Emit typed events for hostage-related actions (hostage rescue game mode).

**Acceptance Criteria:**
- [ ] `hostageRescued` event with: player (Player), hostage (number), site (number)
- [ ] `hostagePickedUp` event with: player (Player), hostage (number)
- [ ] `hostageHurt` event with: player (Player), hostage (number)

**Cycle:** developer (implements + tests) -> reviewer
