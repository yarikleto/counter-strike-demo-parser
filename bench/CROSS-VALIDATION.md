# Cross-validation

Cross-validation diffs our golden snapshots (`test/golden/{header,kills,rounds}.json`) against an export produced by [demoinfocs-golang](https://github.com/markus-wa/demoinfocs-golang), the de-facto reference parser for Counter-Strike demos. We run it as a sanity check on every non-trivial change to the parser pipeline: it's not a replacement for our unit/integration tests, but it catches drift against an independent implementation that has many more eyes on it. The two halves are deliberately decoupled — the Go exporter writes `bench/demoinfocs-export.json`, and the TypeScript comparator (`scripts/cross-validate.ts`) consumes that file. Dev machines without a Go toolchain can still run `npm run cross-validate`; it prints a one-line "run the exporter first" hint and exits 0 (skip).

## How to run

```bash
# 1. Refresh the reference export (requires Go).
cd scripts/demoinfocs-export && go run . ../../test/fixtures/de_nuke.dem

# 2. Diff against our goldens.
npm run cross-validate
```

## Latest snapshot (de_nuke.dem, 2026-05-06)

```
=== cross-validation report ===

[PASS] Header
  mapName:       ours="de_nuke" theirs="de_nuke" OK
  playbackTicks: ours=398357 theirs=398357 OK

[PASS] Kills
  total kills:   ours=337 theirs=337 delta=+0
  tolerance:     ratio=1.000 threshold>=0.75 OK
  per-victim:    shared=10 mismatches=0

[PASS] Rounds
  total rounds:  ours=31 theirs=32 delta=-1
  note:          dropped leading "spectators" warmup round on theirs side
  winners:       overlap=31 matches=31 mismatches=0

--- summary ---
  Header   PASS
  Kills    PASS
  Rounds   PASS
```

Exit code: `0`.

## Known differences

These are expected disagreements between any two CS demo parsers. The comparator normalizes around them so legitimate divergences stand out.

- **Round count off-by-one (warmup row).** demoinfocs emits a leading "Spectators" row for the pre-match warmup, our `RoundTracker` drops it. The comparator detects a leading `spectators`/`unassigned` row on theirs side and offsets the per-index comparison so gameplay rounds align.
- **Kill filtering (world / suicide / bot edge cases).** Different parsers categorize world-damage deaths, fall damage, and certain bot-driven events differently. Total counts can diverge by single-digit percentages on most demos. The comparator allows up to 25% delta before failing — much wider than any difference we've actually seen on real demos, but conservative enough to avoid red herrings.
- **End-reason enum naming.** Our golden uses the integer enum (e.g. `7`, `8`, `9`); demoinfocs emits a string label (e.g. `"7"`, `"BombDefused"`, depending on version). We don't compare end reasons across parsers — only winners after a normalize-to-canonical pass.
- **Weapon name strings.** `weapon_ak47` vs `ak47` vs `AK-47` — every parser invents its own form. We don't compare weapon strings cross-parser; the per-victim aggregate is the cross-parser kill metric.
- **Player slot count.** Bots and spectators land on `xuid: 0` and may collapse or expand by one depending on whether the parser reports the GOTV/server slot. demoinfocs reports 11 for de_nuke; we report 10 (no GOTV slot).
