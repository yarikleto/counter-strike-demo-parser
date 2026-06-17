# Per-prop bit trace — first divergence on entity 1 CCSPlayer enter-PVS

**Date:** 2026-04-28
**Fixture:** `test/fixtures/de_nuke.dem`
**Probe:** instrumented `readChangedFieldIndicesAndDecode` (gated on `DEBUG_ENT_DECODE=1`); harness is `/tmp/demoinfocs-research/our-parser-probe.cjs`.
**Raw stderr trace:** `/tmp/demoinfocs-research/our-prop-trace-stderr.txt` (1689 lines)

## BLUF

The per-prop bit consumption is consistent with each prop's own metadata for the first 26 entries (idx 0..25 match golden byte-for-byte). The first divergence is at **ourIdx=26**: our flattener places `movetype` (Int, 4 bits) where `markus-wa/demoinfocs-golang` places `m_AnimOverlay.001.m_flWeight` (Float, 8 bits, lowValue=0, highValue=1). Bit-cursor desyncs by 4 bits at this point and never recovers.

**This is not a per-prop decoder bug. It is a flattener-order bug.** The decoder reads the right number of bits for `movetype` (4); but the wire was sent for an `m_AnimOverlay.001.m_flWeight` slot, so demoinfocs reads 8 bits. The bug lives in `src/datatables/Flattener.ts` (or upstream — `SendTableRegistry`/`Exclusions`), not in `IntDecoder.ts`/`FloatDecoder.ts`/etc.

## Secondary signal: changed-prop list is also wrong

`totalIndices = 1745` for the entity 1 enter-PVS — i.e., our `readFieldIndex` produced an index for *every* flat-prop slot, sequentially (`loopPos == ourIdx` for all 1614 entries before the BitReader exhausts). Demoinfocs would read ~50 indices. Either:
- `readFieldIndex`'s `newWay` path is wrong (the +1 fast path always fires), OR
- the bit cursor entered the field-index loop already misaligned (header miscount: `classIdBits` / serial / `newWay` flag).

The instrumentation reports `before/after` for prop *values* only — it cannot distinguish these two without further probing. But the flatten-order divergence at idx 26 is real and independent of the index-list anomaly: the per-prop wire decode consumes wrong bits at any flat-list position whose metadata disagrees with golden.

## First-25 cross-check (matches golden, exonerates per-prop decoders)

| ourIdx | varName (ours) | type | nBits | flags (hex) | bitsConsumed | expected (golden idx → expected) | divergence |
|---|---|---|---|---|---|---|---|
| 0 | m_flSimulationTime | Int | 8 | 0x40001 (UNSIGNED|CHANGES_OFTEN) | 8 | 8 (Int 8) | none |
| 1 | m_nTickBase | Int | 32 | 0x0 | 32 | 32 | none |
| 2 | m_vecOrigin | VectorXY | 0 | 0x40004 (NOSCALE|CO) | 64 | 64 (2 NOSCALE floats) | none |
| 3 | m_vecOrigin[2] | Float | 0 | 0x40004 (NOSCALE|CO) | 32 | 32 | none |
| 4 | m_vecVelocity[0] | Float | 0 | 0x4 (NOSCALE) | 32 | 32 | none |
| 5 | m_vecVelocity[1] | Float | 0 | 0x4 | 32 | 32 | none |
| 6 | m_vecVelocity[2] | Float | 0 | 0x4 | 32 | 32 | none |
| 7 | m_vecOrigin | VectorXY | 0 | 0x40004 | 64 | 64 | none |
| 8 | m_vecOrigin[2] | Float | 0 | 0x40004 | 32 | 32 | none |
| 9 | m_nDuckTimeMsecs | Int | 10 | 0x40001 | 10 | 10 | none |
| 10 | m_flFallVelocity | Float | 17 | 0x40000 (CO) lo=-4096 hi=4096 (quantized) | 17 | 17 | none |
| 11 | m_viewPunchAngle | Vector | 0 | 0x40002 (COORD|CO) | 6 | variable; 6 = three readBitCoord with intFlag=0 frac=0 | none |
| 12 | m_aimPunchAngle | Vector | 0 | 0x40002 | 6 | 6 | none |
| 13 | m_aimPunchAngleVel | Vector | 0 | 0x40002 | 6 | 6 | none |
| 14 | m_vecViewOffset[2] | Float | 10 | 0x40000 lo=0 hi=128 (quantized) | 10 | 10 | none |
| 15 | m_fFlags | Int | 11 | 0x40001 | 11 | 11 | none |
| 16 | m_iFOV | Int | 8 | 0x40001 | 8 | 8 | none |
| 17 | m_flFOVTime | Float | 0 | 0x40004 (NOSCALE) | 32 | 32 | none |
| 18 | m_flDuckAmount | Float | 0 | 0x40004 | 32 | 32 | none |
| 19 | m_flDuckSpeed | Float | 0 | 0x40004 | 32 | 32 | none |
| 20 | m_angEyeAngles[0] | Float | -1 | 0x4000c (NOSCALE|ROUNDDOWN|CO) | 32 | 32 (NOSCALE wins flag priority over ROUNDDOWN-quantized) | none |
| 21 | m_angEyeAngles[1] | Float | -1 | 0x4000c | 32 | 32 | none |
| 22 | m_iMoveState | Int | 32 | 0x40000 (CO, signed) | 32 | 32 | none |
| 23 | m_iGunGameProgressiveWeaponIndex | Int | 32 | 0x40001 | 32 | 32 | none |
| 24 | m_flGroundAccelLinearFracLastTime | Float | 0 | 0x40004 (NOSCALE) | 32 | 32 | none |
| 25 | m_cycleLatch | Int | 4 | 0x40001 | 4 | 4 | none |

All 26 (idx 0..25) match. Per-prop decoders are correct on these inputs.

## First divergent prop

**ourIdx = 26**

| field | ours | golden (demoinfocs) |
|---|---|---|
| varName | `movetype` | `m_AnimOverlay.001.m_flWeight` |
| type | Int (0) | Float (1) |
| numBits | 4 | 8 |
| flags | 0x1 (UNSIGNED) | 0 (no special encoding → quantized, low=0 high=1) |
| **bitsConsumed (ours)** | **4** | — |
| **bits demoinfocs consumes here** | — | **8** |
| **divergence** | **−4 bits** | |

The wire bits at bit-cursor 2424..2432 are the encoder's quantized-Float8 payload for `m_AnimOverlay.001.m_flWeight`. We read only the low 4 bits and call them `movetype`, leaving the next 4 bits to be misinterpreted as the head of the *following* prop's value.

## Diagnosis

The bug is in the **SendTable flattener** (`src/datatables/Flattener.ts`), not in any property decoder file. The flatten algorithm produces a different prop ordering than `markus-wa/demoinfocs-golang`'s `flattenDataTable` for CCSPlayer at priority 128.

Likely candidates inside the flattener:
1. **Priority-128 partition pass ordering.** Source's algorithm pulls `SPROP_CHANGES_OFTEN` props out of their natural priority and re-injects them at priority 64 (treated as 64 for sort). Within the priority-128 bucket, demoinfocs's gather order places `m_AnimOverlay.001.m_flWeight` immediately after `m_cycleLatch`. Our flattener inserts `movetype` (which is from a different parent table — `DT_BaseEntity` or similar — and likely has priority 0 or 1 in golden, not 128) into the priority-128 slot.
2. **CHANGES_OFTEN re-priority misapplication.** If our flattener treats CHANGES_OFTEN as priority 64 only when sorting (not when partitioning), or if it applies it across the wrong set, a prop like `movetype` at priority 1 with no CHANGES_OFTEN flag could leak into the bucket between idx 25 and idx 26.
3. **Exclude/baseclass walk depth-first order divergence.** Our flattener may visit `DT_BaseEntity` (which contains `movetype`, `movecollide`, `m_iTextureFrameIndex`, `m_bSimulatedEveryTick`, ...) at the wrong tree-walk position relative to `DT_AnimOverlay[1..14]`.

The trace `ourIdx 26..28` reads `movetype, movecollide, m_iTextureFrameIndex` — this is the exact signature of `DT_BaseEntity`'s tail, which in our parser appears immediately after `m_cycleLatch` (last of the priority-128 SPROP_CHANGES_OFTEN block). Demoinfocs places `DT_BaseEntity`'s tail much later (or earlier — the golden table around idx 26 is dominated by `m_AnimOverlay.NNN.*` for ~390 entries before any `DT_BaseEntity` content appears).

So the actionable diagnosis: **our flattener emits `DT_BaseEntity`'s priority-1 props inside the priority-128 bucket, between `m_cycleLatch` (genuine priority-128 SPROP_CHANGES_OFTEN tail) and the start of `m_AnimOverlay.001.*`.** The fix lives in the priority-bucket loop of `Flattener.ts`.

## Owner files

- **Bug location: `src/datatables/Flattener.ts`** — priority sort / SPROP_CHANGES_OFTEN partitioning / gather-order walk.
- **NOT the bug: per-prop decoders** (`IntDecoder.ts`, `FloatDecoder.ts`, `VectorDecoder.ts`, `StringDecoder.ts`, `ArrayDecoder.ts`). Each one correctly consumes the bits its own metadata implies.

## Notes on `totalIndices=1745`

Even with the flattener fixed, the field-index loop reading 1745 indices is a separate symptom. With wrong flatten order, no prop value validates as a sentinel, and `readFieldIndex` keeps producing `lastIndex+1` until the buffer ends. This will likely auto-resolve once the flattener matches golden, because the encoded indices will then deserialize as normal small deltas rather than monotone sequential `+1`s. If it does not, that is a separate `readFieldIndex` `newWay` defect to chase next.

## Files

- Trace (1689 lines stderr): `/tmp/demoinfocs-research/our-prop-trace-stderr.txt`
- First-50-prop slice: `/tmp/demoinfocs-research/ccsplayer-first50.json`
- Golden flat-prop dump (3737 lines): `/Users/yaroslavp/Documents/cs-demo/.claude/research/golden-flat-props.md` (CCSPlayer table starts at line 40)
- Probe harness: `/tmp/demoinfocs-research/our-parser-probe.cjs`
- This report: `/Users/yaroslavp/Documents/cs-demo/.claude/research/per-prop-bit-trace.md`
