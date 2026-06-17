# TASK-049: Console command parsing

**Milestone:** 5 — Advanced Data
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-003

**Goal:** Parse dem_consolecmd frames and extract the console command string.

**Acceptance Criteria:**
- [ ] Read length-prefixed string from consolecmd frame data
- [ ] Emit `consoleCommand` event with the command string and tick number

**Cycle:** developer (implements + tests) -> reviewer
