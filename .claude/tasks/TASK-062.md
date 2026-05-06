# TASK-062: High-level DemoParser.parse() API + DemoResult type

**Milestone:** 6 — Convenience & DX
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-048

**Goal:** Implement the high-level `DemoParser.parse()` method that parses an entire demo and returns a structured DemoResult object. This is the async/await API described in the README.

**Acceptance Criteria:**
- [ ] `DemoParser.parse(pathOrBuffer)` returns `Promise<DemoResult>`
- [ ] DemoResult contains: header, players (final state), kills, rounds, grenades, chatMessages, events (raw)
- [ ] Internally uses the streaming API + collectors that accumulate data
- [ ] Works with both file path (string) and Buffer input
- [ ] All data is fully typed — no `any` in the DemoResult tree

**Cycle:** developer (implements + tests) -> reviewer
