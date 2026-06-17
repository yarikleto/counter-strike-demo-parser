# TASK-055: SteamId utility (Steam2/Steam3/Steam64 conversion)

**Milestone:** 5 — Advanced Data
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-001

**Goal:** Utility class for converting between Steam ID formats: Steam2 (`STEAM_0:1:12345`), Steam3 (`[U:1:24691]`), and Steam64 (`76561198000000001`).

**Acceptance Criteria:**
- [ ] `SteamId.fromSteam64(id)` creates from 64-bit ID
- [ ] `toSteam2()` returns `STEAM_X:Y:Z` format
- [ ] `toSteam3()` returns `[U:1:NNNN]` format
- [ ] `toSteam64()` returns numeric 64-bit Steam ID
- [ ] Correct conversion for all formats (bidirectional)

**Cycle:** developer (implements + tests) -> reviewer
