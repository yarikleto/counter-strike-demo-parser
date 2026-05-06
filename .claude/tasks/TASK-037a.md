# TASK-037a: Vitest config — split unit + integration runs

**Milestone:** 4 — Events (infra)
**Status:** `READY`
**Size:** S | **Type:** infra
**Depends on:** —
**Filed:** 2026-05-03 (CEO, after TASK-037 hit the same vitest worker-RPC cascade as TASK-034 but at a higher integration-file count)

## Why this exists

TASK-034 mitigated a vitest worker-RPC heartbeat cascade by capping `maxThreads` to 4 (`vitest.config.ts`). At 9 heavy integration files this was sufficient. By the end of TASK-037 we have 12+ integration files, and the cap is no longer enough — 2-4 false-positive failures appear per full-suite run with messages like:

```
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
```

Each failing file passes cleanly in isolation. The cause is well-understood: every integration test calls `parser.parseAll()` on `de_nuke.dem`, blocking sync compute for ~2-3s per parse. When N>1 such workers run in parallel, vitest's internal RPC heartbeat times out because no worker is free to service it. Reducing `maxThreads` further (to 2 or 1) trades the cascade for a 7-26 minute wall-clock run with strange utilization patterns (unclear root cause; likely vitest-internal teardown/spawn churn between files in serial mode).

## Hypotheses to investigate

1. **Split into two vitest projects:**
   - `test:unit` — parallel default config, only `test/unit/**`
   - `test:integration` — `pool: "threads"`, `maxThreads: 1` (or `pool: "vmThreads"` with `singleThread: true`), only `test/integration/**`
   - `test` — runs both sequentially via `npm-run-all` or simply `&&`
2. **Eliminate the per-test parseAll** — share one parsed `parser` instance across multiple assertions in the same file via `beforeAll`. This is the *bigger* win: cuts integration runtime by ~5-10x. Requires audit of whether tests mutate parser state, and `parseAll()` is currently the unit of work that drives all assertions, so most assertions just inspect post-parse state — sharing should be safe.
3. **VITEST_RPC_TIMEOUT or similar env override** — if vitest exposes the heartbeat-timeout knob, raise it. Did not find documented at the time of filing; may have been added in a newer version.

## Acceptance criteria

- [ ] `npm run test` runs to completion in <2 min wall on a typical dev machine.
- [ ] Zero false-positive `Timeout calling "onTaskUpdate"` failures across 5 consecutive runs.
- [ ] `npm run test:unit` and `npm run test:integration` run independently for fast dev loops.
- [ ] CI workflow (if any exists) updated to use the split scripts.

## Failure mode if skipped

Full-suite green is unreliable, blocking confidence in M4 event-category tasks (038-046, 047) which will each add new heavy integration tests and worsen the cascade. Reviewers will need to verify each task in isolation, slowing review cycles.

## Cycle

developer (config split + script wiring) -> reviewer

## Notes

- Don't touch test files when fixing this — purely a config + npm-script refactor.
- The current vitest.config.ts has a comment block explaining the known limitation; remove it once this task lands.
- Investigate hypothesis #2 (`beforeAll` parser sharing) only after the split lands and is shown insufficient.
