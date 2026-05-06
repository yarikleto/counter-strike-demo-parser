# TASK-075: Golden file test infrastructure

**Milestone:** 7 — Performance & Polish
**Status:** `TODO`
**Size:** M | **Type:** setup
**Depends on:** TASK-061

**Goal:** Set up golden file testing infrastructure. Parse the fixture demo, snapshot the output to committed JSON files, and compare against them on every test run.

**Acceptance Criteria:**
- [ ] Script to generate golden files: parse fixture, write structured JSON output to `test/golden/`
- [ ] Test runner compares current parse output against committed golden files
- [ ] Diff output on failure shows exactly which values changed
- [ ] `--update` flag to regenerate golden files when behavior intentionally changes
- [ ] Golden files committed to git (small, deterministic)

**Cycle:** developer (implements + tests) -> reviewer
