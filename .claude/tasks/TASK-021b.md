# TASK-021b: Tick-loop wiring — CCSPlayer spawn count + entityUpdated frequency

**Milestone:** 2 — Core Protocol
**Status:** `DONE` (closed 2026-04-29; reviewer APPROVE; both deferred tests now passing)
**Size:** S | **Type:** validation
**Depends on:** TASK-026
**Filed:** 2026-04-29 (CEO, after Flattener fix landed and m_iTeamNum=2 confirmed)
**Closed:** 2026-04-29

## Resolution

Hypothesis #1 (self-disable too eager) was the correct diagnosis but only half of the fix. Removing `_entityDecodeDisabled` from `DemoParser.ts` exposed the cascade root cause: `EntityList.create` threw `EntityClassMismatchError` when an `enter-PVS` arrived for a slot already holding an entity of a different `serverClassId`. de_nuke trips this on entity 417 (class 11 vs 143). One throw per parse used to disable the decoder for the rest of the demo, suppressing ~94k legitimate downstream events.

ADR-002 amendment (line 254) explicitly authorized a re-visit if a real demo trips this guard. de_nuke trips it. Implemented the ADR-authorized escape hatch in `src/entities/PacketEntitiesDecoder.ts` enter-PVS branch: when the slot exists with a different class, emit `onDelete` for the stale entity, call `entityList.delete(entityId)`, then proceed with `entityList.create(...)`. `EntityList.create` still rejects same-id-different-class — the API contract is unchanged; the decoder just no longer hands it the mismatch case.

**Before:** 94,816 `entityDecodeError` fires, 3 CCSPlayer creates, 99 entityUpdated events.
**After:** 0 `entityDecodeError` fires, 22 CCSPlayer creates (7 alive at end), 1.94M entityUpdated events. Both deferred integration tests pass; full suite 412/412 green.

**Files touched:** `src/DemoParser.ts`, `src/entities/PacketEntitiesDecoder.ts`, `test/integration/entities.test.ts`.

**Follow-up (not filed yet — CEO call):** Reviewer suggested a future TASK-021c to cap `entityDecodeError` emissions per parse. Pre-fix, 94k thrown exceptions slowed vitest workers ~100x; if a future regression reintroduces a desync cascade, vitest will silently throttle. Out of scope here; defer until a concrete need arises.

## Why this exists

After M2 entity decode correctness was validated end-to-end (Flattener walk-order fix + InstanceBaseline rewrite + PacketEntitiesDecoder interleaving fix), 4 of 6 integration tests in `test/integration/entities.test.ts` flipped to passing — including all the byte-correctness anchors (`m_iTeamNum ∈ {2,3}`, `m_vecOrigin` finite, etc.).

Two assertions remain unmet, but they are NOT decode bugs:
1. **CCSPlayer spawn count:** test expects `>= 5` players; only 3 are observed.
2. **entityUpdated frequency:** test expects `> 100` events; only 99 fire.

The agent that landed the Flattener fix verified independently that the entities WHICH DO get created have correct property values. So the bug is in entity LIFECYCLE / tick-loop wiring, not in decode logic.

## Hypotheses to investigate

1. **PacketEntities `entityDecodeError` self-disables too eagerly.** After the Flattener fix, the entity decoder may still hit a bit-cursor desync further into the demo (e.g., on a specific weapon class, or grenade detonation), and the disable-on-error guardrail then suppresses subsequent tick updates. This would explain both low spawn count AND low update count.
2. **PacketEntities full-update trailer not handled.** `msg.isDelta = false` demos emit a trailer the decoder skips per a `// TODO TASK-027` deferral. If this is consuming tick events that should fire `entityUpdated`, the count drops.
3. **PVS leave-and-re-enter cycles** create entities that are immediately deleted before user code observes them. This would explain low spawn count without affecting correctness.

## Acceptance Criteria

- [ ] Run instrumented parse on de_nuke.dem; capture per-tick entity event counts.
- [ ] Compare to demoinfocs's per-tick counts on the same demo.
- [ ] Identify which hypothesis matches.
- [ ] Apply the fix in the appropriate file (likely `PacketEntitiesDecoder.ts` or `DemoParser.ts` event-emit logic).
- [ ] Un-skip the remaining 2 tests in `test/integration/entities.test.ts`.

## Failure mode if skipped

Consumers using the entity event stream will see fewer than expected lifecycle events on real demos. Stat aggregators that count "kills per round" via player-update events will undercount. The decoded values themselves are correct; the cadence is undercounted.

## Cycle

developer (instruments + diagnoses + fixes) -> reviewer

## Notes

- This task is independent of TASK-018a / TASK-021a — those tracked decode correctness, which is now closed (per the Flattener fix and the anchor-test passing).
- The 2 deferred assertions in `entities.test.ts` are clearly marked with `// TODO TASK-021b:` so they're greppable.
