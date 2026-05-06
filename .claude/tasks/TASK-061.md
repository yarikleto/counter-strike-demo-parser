# TASK-061: Integration test suite against de_dust2.dem fixture

**Milestone:** 5 — Advanced Data
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-048

**Goal:** Comprehensive integration tests that parse the `de_dust2.dem` fixture file and verify the full pipeline produces correct data.

**Acceptance Criteria:**
- [ ] Parse fixture file end-to-end without errors
- [ ] Verify header values (map name, protocol version, tick count)
- [ ] Verify player count and at least one player's final stats (kills, deaths, name)
- [ ] Verify at least one kill event has correct attacker, victim, weapon
- [ ] Verify round count matches expected value
- [ ] Verify entity system created and tracked entities (non-zero entity count)

**Cycle:** developer (implements + tests) -> reviewer
