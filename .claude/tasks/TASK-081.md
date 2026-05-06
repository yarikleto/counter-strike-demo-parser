# TASK-081: Cross-validation against demoinfocs-golang

**Milestone:** 7 — Performance & Polish
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-061

**Goal:** Parse the same demo file with both our parser and demoinfocs-golang, compare outputs, and verify they match on key data points.

**Acceptance Criteria:**
- [ ] Script to parse fixture with demoinfocs-golang and export JSON (header, players, kills, rounds)
- [ ] Comparison script that diffs our output vs demoinfocs-golang output
- [ ] Key data points match: header fields, player names and stats, kill count, round results
- [ ] Document any known differences with explanation (e.g., rounding, field naming)

**Cycle:** developer (implements + tests) -> reviewer
