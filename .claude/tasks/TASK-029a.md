# TASK-029a: PlayerResource overlay needs Flattener array-name synthesis

**Milestone:** 3 — Typed State Overlays
**Status:** `READY` (deferred from M3 Slice 2)
**Size:** M | **Type:** infrastructure + overlay
**Depends on:** TASK-029
**Filed:** 2026-04-29 (CEO, after M3 Slice 2 schema-mismatch surfaced)

## Why this exists

`src/state/PlayerResource.ts` was implemented during M3 Slice 2 with the assumption that array-element flat props would be named like `m_iKills.000`, `m_iKills.001`, ... (demoinfocs convention). Our `Flattener.ts` instead emits the raw on-wire `varName` for array elements, which is literally just the index suffix (e.g., `'000'`, `'001'`). All 64 stat slots across all 5 stat types share the same `varName` strings, distinguishable only by the parent ARRAY prop's name — which is NOT recorded on the FlattenedSendProp.

`PlayerResource`'s unit tests pass because they mock entities with the dotted-path varNames. Real entities have bare names. So the class is correctly written; the Flattener is the bottleneck.

## The fix

Two options:

**(a) Synthesize compound display names during flattening.** Modify `src/datatables/Flattener.ts` to track parent ARRAY names while expanding array elements. Each expanded flat prop's varName becomes `${parentArrayName}.${elementIndex}` (e.g., `m_iKills.000`). This matches demoinfocs's convention but mutates the on-wire varName, which the existing Flattener unit tests likely pin.

**(b) Add a `displayName: string` field to `FlattenedSendProp`.** The `varName` stays as-is (preserving wire-format invariance); a new computed field carries the dotted path. Overlays read `displayName` for lookup. Less invasive but requires adding a field to a frozen type.

Either way, `PlayerResource.ts`'s constructor lookup logic stays the same; the Flattener's output changes.

## Acceptance Criteria

- [ ] `parser.serverClasses.byName("CCSPlayerResource")?.flattenedProps.find(p => p.prop.varName === "m_iKills.000")` resolves to a defined entry (option a) OR equivalent via `displayName` (option b).
- [ ] `PlayerResource(entity)` constructor succeeds against a real CCSPlayerResource entity from de_nuke.
- [ ] `parser.playerResource` getter re-added to DemoParser (currently removed in M3 Slice 2 to avoid throwing).
- [ ] Unit tests for `Flattener` updated to reflect the new naming convention; existing 18 anchor assertions in `flattening.test.ts` updated where they reference array-element flat props.
- [ ] Integration test on de_nuke: `parser.playerResource?.killsForSlot(0)` returns a sensible number (likely 0 at signon).

## Failure mode if skipped

`parser.playerResource` is `undefined` permanently. Consumers who want per-player kill/death stats must read directly from the entity store using array-template indices — workable but undocumented and ugly.

## Cycle

architect (decide a vs b) → developer → reviewer.

## Notes

- The Flattener was reviewed in Slice 2 and APPROVED with anchor tests. Touching it requires re-review.
- Option (b) is likely lower risk; the Flattener change is purely additive (new field, no varName mutation).
- PlayerResource.ts and its unit tests stay as-is — only the Flattener output changes to match what the overlay expects.
