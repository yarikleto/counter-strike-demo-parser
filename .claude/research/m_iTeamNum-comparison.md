# Narrow validation probe: m_iTeamNum on first CCSPlayer

**Date:** 2026-04-28
**Fixture:** `test/fixtures/de_nuke.dem`
**Comparison side A:** our parser (`dist/index.cjs`, current `src/`)
**Comparison side B:** `markus-wa/demoinfocs-golang` v3 (commit pinned in `/tmp/demoinfocs-research/demoinfocs-golang`)

## Question

Does our parser's decoded `m_iTeamNum` for the first `CCSPlayer` entity match demoinfocs's decoded value for the same entity at the same tick?

## Methodology

- One player: lowest entityId where `serverClass.className === "CCSPlayer"`. Both parsers select **entity 1** (entity 0 is CWorld, classId 275; entity 1 is CCSPlayer, classId 40, serial 376).
- One tick: `tick=0`, the first PacketEntities frame the entity appears in (enter-PVS).
- One prop: `m_iTeamNum` — flat-prop **type=Int (0)**, **numBits=6**, **flags=0**, no special encoding.

Probe scripts:

- TS side: `/tmp/demoinfocs-research/our-parser-probe.cjs` — instantiates `DemoParser`, listens for `entityCreated` and `entityDecodeError`, on first `CCSPlayer` reads via `entity.store.read(slot, idx)` and `entity.propByName("m_iTeamNum")`. Also enumerates every populated prop on the entity to confirm what the create-delta actually wrote.
- Go side: `/tmp/demoinfocs-research/teamnumprobe/main.go` — registers `OnEntityCreated` on the `CCSPlayer` ServerClass after `DataTablesParsed`, calls `e.PropertyValueMust("m_iTeamNum").IntVal` on the first invocation, also dumps `m_iHealth`, `m_lifeState`, `m_iAccount`, `m_vecOrigin` for context.

## Raw output

### Our parser (`node our-parser-probe.cjs`)

```json
{
  "side": "our-parser",
  "event": "first-CCSPlayer",
  "entityId": 1,
  "classId": 40,
  "className": "CCSPlayer",
  "serialNumber": 376,
  "flatPropTotal": 1745,
  "teamNumFlatIdx": 511,
  "teamNumPropDef": {
    "type": 0,
    "varName": "m_iTeamNum",
    "flags": 0,
    "priority": 128,
    "numElements": 0,
    "lowValue": 0,
    "highValue": 0,
    "numBits": 6,
    "dtName": ""
  },
  "teamNumRawStoreValue": "<undefined>",
  "teamNumPropByName": "<undefined>",
  "writtenPropCount": 0,
  "writtenPropsFirst20": [],
  "writtenPropsContainsTeamNum": false
}
```

Then, immediately following on the same PacketEntities message:

```json
{
  "side": "our-parser",
  "event": "entityDecodeError",
  "message": "decodePacketEntities: decoded prop index 2024 is out of range [0, 1745) for CCSPlayer — likely wire-format divergence (TASK-021a) or flatten miscount.",
  "entityCreatedCountSoFar": 2,
  "firstCCSPlayerSeen": true
}
```

### demoinfocs (`./teamnumprobe de_nuke.dem`)

```
{"side":"demoinfocs","event":"first-CCSPlayer","tick":0,"entityId":1,"classId":40,
 "className":"CCSPlayer","m_iTeamNum":2,
 "otherProps":"m_iAccount:int=16000 m_iHealth:int=100 m_lifeState:int=0 m_vecOrigin:PANIC..."}
```

(`m_vecOrigin` panics inside demoinfocs because the cell-coord assembly looks up `m_cellbits` from a different ServerClass; not relevant here.)

## Comparison

| field | our parser | demoinfocs |
|---|---|---|
| entityId | 1 | 1 |
| classId | 40 (CCSPlayer) | 40 (CCSPlayer) |
| flat-prop count | 1745 | (matches earlier golden dump) |
| m_iTeamNum flat-prop index | 511 | (resolved by name) |
| **m_iTeamNum value** | **`<undefined>` (never written)** | **`2`** |
| total props written by enter-PVS | **0** | dozens (at minimum: TeamNum, Health, Account, lifeState, vecOrigin, ...) |
| state after entity 1 | bit cursor desynced — next entity reads prop idx 2024 (out of [0, 1745)) | clean |

## Outcome: (c) — our parser fails before producing a usable CCSPlayer

The CCSPlayer view is created with `serverClass.className === "CCSPlayer"`, classId 40, serial 376 — those agree with demoinfocs. But:

1. **Zero props are written** to entity 1's storage by the time `entityCreated` fires. That means either (a) the baseline lookup for CCSPlayer failed AND `readAndApplyChangedProps` decided immediately that the changed-prop list was empty (first `readFieldIndex` call returned -1), or (b) a silent baseline failure plus a create-delta whose first decoded `lastIndex` is somehow beyond `total` and was caught upstream. (Looking at the code path: `getOrDecodeBaseline` is wrapped in try/catch and silently sets `baseline = undefined`, then `readAndApplyChangedProps` runs unconditionally — so the create-delta produced 0 props, meaning the very first `readFieldIndex` returned -1. That's only possible if `newWay=0` AND `readBits(7)===0xFFF`-ish, OR `newWay=1 && readBit()===0 && readBit()===0 && readBits(7) & sentinel`. Either way, the decoder thinks there are no changed props on CCSPlayer's enter-PVS.)
2. **The bit cursor is desynced** by the end of entity 1's slice — entity 2 (also CCSPlayer in the same PacketEntities message, the first opponent) reads a prop index 2024, way past the 1745-entry cap. So whatever bits we consumed for entity 1's create-delta were the wrong number.

This is consistent with a **structural pre-prop bug**: either the baseline-decode silently consumes too few/too many bits, or the `readAndApplyChangedProps` `newWay` flag / `readFieldIndex` byte alignment is off, or the enter-PVS path itself is reading the wrong number of header bits before getting to the prop loop. Because `decodeProp` was never even invoked for this entity (writtenPropCount = 0), the per-prop decoders (Int, Float, String, etc.) are exonerated for this specific failure mode — no `decodeInt` ever ran on m_iTeamNum, so any Int-decoder bug is moot here.

## Implication for TASK-018a vs TASK-021a

**TASK-018a (structural — flatten order, bit cursor, changed-prop loop) is overwhelmingly the more likely site of the fix.**

Specifically:

- **Most likely root cause:** the changed-prop loop's `newWay` flag handling, the `readFieldIndex` tag-tag-tag tree, the entity-header bit consumption (classId bits + serial 10 bits + the `newWay` bit), or the instance-baseline application path is reading a different number of bits than Source / demoinfocs. The `0 props written, then immediate desync` signature points to the structural decoder, not the per-type prop decoders.
- **Less likely but still in TASK-018a's surface area:** the flatten order is wrong such that the bit cursor lands on what looks like a `0xFFF` terminator on the very first iteration. (The total prop count of 1745 is suspiciously close-to-but-not-equal to demoinfocs's expected count — would be worth a one-line cross-check with the existing `golden-flat-props.md` artifact.)
- **TASK-021a (per-prop decoder divergence — Float ROUNDDOWN, String NUL, CELL_COORD ambiguity, etc.) is exonerated for this failure.** `decodeInt` was never invoked on m_iTeamNum. m_iTeamNum is the simplest possible prop — no quantization, no NUL, no rounding — and our parser doesn't even attempt to decode it. The bug fires before any prop value is decoded for the entity. Whatever lives in TASK-021a is downstream of where the wheels actually come off.

## Files

- Probe (TS / our parser): `/tmp/demoinfocs-research/our-parser-probe.cjs`
- Probe (Go / demoinfocs): `/tmp/demoinfocs-research/teamnumprobe/main.go` + binary `teamnumprobe`
- This report: `/Users/yaroslavp/Documents/cs-demo/.claude/research/m_iTeamNum-comparison.md`
