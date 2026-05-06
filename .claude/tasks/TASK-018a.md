# TASK-018a: Validate priority-140 within-bucket order

**Milestone:** 2 — Core Protocol
**Status:** `DONE` (closed by Flattener fix; root cause was COLLAPSIBLE distinction at priority-128, not priority-140 as originally hypothesized)
**Size:** S | **Type:** validation
**Depends on:** TASK-018, TASK-021, TASK-026
**Filed:** 2026-04-29 (CEO, after Slice 2 review)

## Why this exists

Slice 2's `prioritySort` produces flat-prop counts EXACTLY matching `markus-wa/demoinfocs-golang` for all four cross-checked classes (CCSPlayer 1745, CWeaponCSBase 515, CCSGameRulesProxy 1126, CCSTeam 16). However, within CCSPlayer's priority-140 bucket — which contains 390 `m_iMatchStats_*` array expansions — our sub-table walk order DIFFERS from demoinfocs.

Reviewer's framing: "demoinfocs is widely deployed and produces correct stats from real CSGO demos, which is strong evidence that demoinfocs's order matches the encoder's. The burden of proof is on us, not on demoinfocs." If our index-to-name mapping in this region differs from the encoder's, M5's per-round-stat readback shows kills in the deaths column and vice versa.

The integration test in `test/integration/flattening.test.ts` (lines 33-45) DOES NOT assert names within rows 1355-1744 of CCSPlayer for this reason — silent acceptance is the temporary state until this task validates.

## Goal

Validate that our priority-140 sub-table walk order produces decoded entity values consistent with `markus-wa/demoinfocs-golang` against a real demo with non-zero match stats. If it does not, fix the walk order (most likely in `Flattener.ts`'s two-pass walker for `m_iMatchStats_*` sub-tables, or in the bucket-sweep stability for the priority-140 tail).

## Acceptance Criteria

- [ ] Pick a real demo with non-zero `m_iMatchStats_*` values (de_nuke fixture may suffice if it has at least one round of stats; otherwise vendor a small additional fixture with played-out stats)
- [ ] Decode CCSPlayer entities via the parser at a tick where stats are populated
- [ ] For at least 5 specific stat fields (e.g., `m_iMatchStats_Deaths`, `m_iMatchStats_Kills`, `m_iMatchStats_HeadShotKills`, `m_iMatchStats_Damage`, `m_iMatchStats_KillReward`), assert that the decoded value matches what `demoinfocs-golang` decodes for the same player at the same tick (run demoinfocs side-by-side or use its captured output)
- [ ] If values match: add the assertions to `test/integration/flattening.test.ts` and remove the avoidance comment at lines 33-45. The priority-140 region is now validated.
- [ ] If values do NOT match: diagnose — almost certainly the sub-table iteration order in `Flattener.ts:walk` for `csteamdata` or whichever sub-table contains the m_iMatchStats expansions. Fix and re-validate.

## Failure mode if skipped

Slice 4 / TASK-021 will appear to ship green (per-prop decoders work in isolation), then M5's player-stat events emit silently wrong values: kill feed and scoreboard show transposed numbers. This was the architect's #1 pre-mortem scenario.

## Cycle

developer (validates + fixes if needed) -> reviewer

## Notes

- Reviewer flagged this as "non-negotiable for proceeding" past Slice 4. Slice 3 (string tables) and Slice 4 sub-tasks (TASK-019, TASK-020) may proceed in parallel; this only gates **TASK-021 closure** and beyond.
- A `// TODO(TASK-018a):` marker in `test/integration/flattening.test.ts` makes this greppable.
