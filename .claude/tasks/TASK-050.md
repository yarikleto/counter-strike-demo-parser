# TASK-050: User command parsing

**Milestone:** 5 — Advanced Data
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-003

**Goal:** Parse dem_usercmd frames and extract user input commands (outgoing sequence number and command data).

**Acceptance Criteria:**
- [ ] Read outgoing sequence number (int32) and command data buffer from usercmd frame
- [ ] Emit `userCommand` event with sequence number and raw data

**Cycle:** developer (implements + tests) -> reviewer
