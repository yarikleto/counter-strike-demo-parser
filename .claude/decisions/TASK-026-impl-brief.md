# TASK-026 Implementation Brief — Entity Create / Update via PacketEntities

> Author: architect | 2026-04-29 | Status: PROPOSED, ready for developer pickup
> Scope: TASK-026 (entity create + update). TASK-027 covers delete + leave-PVS as a small postscript on the same code paths.
> Reads: ADR-001 (flattening), ADR-002 amended (per-class SoA storage), ADR-003 (typed events), `golden-flat-props.md`.

## TL;DR for the developer

You are implementing the layer that takes a `CSVCMsg_PacketEntities` message off the wire and turns it into a stream of `entityCreated` / `entityUpdated` events with real, decoded property values readable through a thin `Entity` view. The decoder template (`FlattenedSendProp[]` per ServerClass) is given; the per-prop sub-decoders (TASK-019/020/021) are landing in parallel. Your storage layout is fixed by ADR-002's 2026-04-29 amendment (per-class struct-of-arrays with primitive-typed columns, lazy slot allocation, lazy-overwrite eviction). The hard parts are (a) the bit-stream entity-header + changed-prop-index decoder, and (b) propagating the typed-array column index from flatten time into write time without per-prop branching on the hot path. Cite `markus-wa/demoinfocs-golang` `pkg/demoinfocs/sendtables/st_parser.go` and `pkg/demoinfocs/datatables.go` whenever you are not sure what a bit means; that parser is the project's de-facto reference.

---

## Section 1 — Per-class typed-array bundle layout

**Decision.** Each `ServerClass` lazily owns one `EntityStore` instance, allocated on first entity-create of that class. The `EntityStore` holds four primitive-typed columns (`Int32Array` for ints, `Float32Array` for floats, interleaved `Float32Array` for vectors, `(string | undefined)[]` for strings), plus an occupancy bitset and a per-(slot, prop) `written` bitset. No `BigInt64Array`. No separate Int64 column. The mapping from `flatPropIndex → (kind, columnOffset)` is precomputed once at flatten time and stored on the `ServerClass` next to `flattenedProps`.

**Where it lives.** Add `entityStore: EntityStore | null` and `propColumns: PropColumn[]` (length = `flattenedProps.length`) to `ServerClass`. The `entityStore` field is `null` until the class's first instantiation; lazy-allocating ensures the ~280 declared but never-instantiated classes cost zero runtime memory. `propColumns` is computed at the end of TASK-018 (flatten priority sort) inside a new helper `computePropColumns(flattenedProps): PropColumn[]` — this is a small extension, not a change, so it does not block on TASK-018a's secondary-key tweak; the column kinds are determined by `prop.type` and `prop.flags`, both of which are stable across the priority tie-breaker question.

**Why on `ServerClass`, not on a separate registry.** ADR-002's amendment says "allocated lazily per ServerClass on first instantiation" — co-locating the store with the class keeps the entity-id → ServerClass → storage chain at two pointer hops. A separate `EntityStoreRegistry` would add a third hop and a `Map.get` per write. The `ServerClass` is already the canonical home of the decode template (`flattenedProps`); the storage is the decoded-value side of the same coin.

**Column kind mapping.** `PropColumn` is:

```ts
type PropColumnKind = 'int' | 'float' | 'vector' | 'vectorxy' | 'string';
interface PropColumn { readonly kind: PropColumnKind; readonly offset: number; }
```

`offset` is the column index within the appropriate typed array — for ints, `offset` ∈ `[0, numIntProps)`; for vectors, `offset` is the vector index, NOT a byte/float offset. Read/write of an int prop at `flatPropIndex i` for slot `s` is `store.ints[s * numIntProps + propColumns[i].offset]`. The `i → (kind, offset)` lookup is one array index — O(1) at decode time. Computed at flatten time by sweeping `flattenedProps` once and assigning offsets in a per-kind running counter. Append-only, never mutated after.

**Vector storage: interleaved `Float32Array` of length `numVectors * 3 * capacity`.** Layout: `[v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, ...]` per slot, slots concatenated. Justification: the dominant access pattern for vectors is "read all three components for one entity at one tick" (origin, velocity, eye angles — all three components are consumed together by M3 state overlays and golden-test asserts). Interleaved gives one contiguous 12-byte read per vector per slot; parallel arrays force three independent indexings into separate buffers. The cost of interleaved is column resizing on capacity doubling — but capacity grows by doubling and amortizes O(1), so this is a non-issue. Pick interleaved.

**VectorXY is a separate kind.** The golden dump shows two VectorXY props on CCSPlayer (`cslocaldata.m_vecOrigin` and `csnonlocaldata.m_vecOrigin`, idx 2 and 7). Source splits these into a 2-component `(x, y)` from one prop and a separate Float prop for `[2]` (z) at the next index — that's exactly what the dump shows (idx 3 = `cslocaldata.m_vecOrigin[2]` Float). Treat VectorXY as its own column kind backed by a `Float32Array` of length `numVectorXYProps * 2 * capacity`. Two lanes per slot, not three. Do not try to fold VectorXY into the `vector` array with a sentinel z — the bit decoder for VectorXY only emits two floats, and you would silently leave the z lane stale across writes.

**Int width: Int32Array only. No BigInt64Array.** I scanned the golden dump for `nBits >= 33` Int props on CCSPlayer / CWeaponCSBase / CCSGameRulesProxy / CCSTeam — there are zero. Max Int width in the dump is 32. CSGO does not ship 64-bit network ints over PacketEntities; 64-bit values arrive via different paths (handles use 21+10 packed into 32, SteamIDs come through string tables not entity props). Specify `Int32Array` for all int props, full stop. ADR-002's amendment open question (`does any class need a BigInt64Array column`) is now answered: no. Document this finding inline so a future class addition doesn't silently truncate. Defensive guard: at flatten time, if any `prop.type === Int && prop.nBits > 32`, throw a clear error `"unexpected int prop with nBits=N; ADR-002 assumes 32-bit max — see TASK-026 brief Section 1"`. This converts a silent corruption into a loud one.

**String storage: `(string | undefined)[]`, length `numStringProps * capacity`.** Three strings on CCSPlayer; sub-1% of write traffic. No optimization warranted. The `undefined` sentinel disambiguates "never written" from `""` (empty string).

**EntityStore shape:**

```ts
class EntityStore {
  readonly serverClass: ServerClass;
  readonly numIntProps: number;
  readonly numFloatProps: number;
  readonly numVectorProps: number;
  readonly numVectorXYProps: number;
  readonly numStringProps: number;
  ints: Int32Array;          // capacity * numIntProps
  floats: Float32Array;       // capacity * numFloatProps
  vectors: Float32Array;      // capacity * numVectorProps * 3
  vectorXYs: Float32Array;    // capacity * numVectorXYProps * 2
  strings: (string | undefined)[]; // capacity * numStringProps
  occupied: Uint32Array;      // ceil(capacity / 32)
  written: Uint32Array;       // ceil(capacity * flattenedProps.length / 32)
  capacity: number;
  freeList: number[];         // returned-to-pool storage slots
  // ... allocate(), free(slot), grow(), read(slot, propIndex), write(slot, propIndex, value)
}
```

The `Array` prop type (1 on CCSPlayer, 2 in the dump total — see TASK-021) decodes to `PropertyValue[]`. Store these in a sixth column: `arrays: (PropertyValue[] | undefined)[]`, sized `numArrayProps * capacity`. Sparse — one per CCSPlayer — so the boxed array is fine.

## Section 2 — Slot-write lifecycle and eviction

**Decision.** Lazy-overwrite via per-(slot, prop) `written` bitset. Eager-zero is rejected as a runtime concern; it is a unit-test-and-review concern.

**Bitset shapes.** `occupied: Uint32Array` of length `ceil(capacity / 32)`. Bit `s` set ⇒ storage slot `s` is currently allocated to a live entity. `written: Uint32Array` of length `ceil(capacity * flattenedProps.length / 32)`. Bit `(s * propCount + i)` set ⇒ value at `(slot s, prop i)` has been written since this slot was last allocated. Use `Uint32Array` over `Uint8Array` because V8 emits faster integer bitops on word-sized lanes.

**Read semantics on an occupied slot, never-written prop: return `undefined`.** If `written` bit is 0, `EntityStore.read(slot, propIndex)` returns `undefined`. This is the same observable behavior the original ADR-002 had with sparse `(PropertyValue | undefined)[]`, just with a one-bit-of-storage representation. Critical for correctness: the entity decode loop only writes the props that appear in the changed-prop-index list; everything else inherits from the previous tick's state OR from the baseline. If the baseline was applied at create, those bits are set; subsequent updates leave them set. A genuinely-never-written prop returns `undefined` — that's a parser-level signal something is structurally wrong (see test plan).

**Read on an unoccupied slot: throw `EntityNotFoundError`.** If `occupied` bit `s` is 0, throw `EntityNotFoundError(entityId)`. This catches the "consumer held a reference past delete" footgun loudly. The Entity view (Section 3) carries a slot version; an `Entity` view whose version is stale also throws on read.

**Delete event semantics.** `EntityList.delete(entityId)`:
1. Resolve entity → `(serverClass, storageSlot)`.
2. Clear `occupied` bit for `storageSlot`.
3. Clear the row's `written` bits — `written.fill(0, slotStart >>> 5, slotEnd >>> 5)` masking the partial words at start and end. ~218 bytes for CCSPlayer, dominated by L1 cache cost.
4. Push `storageSlot` onto `freeList` for reuse.
5. Bump the slot's version counter (Section 3 — the Entity view's `StaleEntityError` mechanism).
6. Drop the `Entity` reference from `EntityList.slots[entityId]` (set to `undefined`).
7. Emit `entityDeleted` synchronously with the now-detached `Entity` view as payload. Listener can read final values out of the view IF and only if it does so synchronously inside the listener — it's the last tick the view's slot version is current.

The typed-array data is **left stale**. Next allocate() at the same `storageSlot` will overwrite cell-by-cell as new writes come in; the cleared `written` bitset masks the stale data from any read before the first write.

**Detection of post-delete reads on a buggy caller.** Three layers:
1. The `Entity` view tracks `(storageSlot, slotVersion)` at construction time. `EntityStore` holds `slotVersions: Uint32Array` (one counter per storage slot, incremented on free). View reads check `view.slotVersion === store.slotVersions[view.storageSlot]`; mismatch ⇒ `StaleEntityError`.
2. `EntityList.get(entityId)` returns `undefined` if the slot is empty; consumers who held an `Entity` reference don't go through `get()` and must rely on (1).
3. In dev mode (`NODE_ENV !== 'production'`, or a `parser.options.strict` flag), `EntityStore.write()` asserts `occupied` bit is set — catches "we wrote to a slot we forgot to allocate" during development with no production overhead.

**Class change check — exactly where it fires.** PacketEntities encodes a 2-bit op flag per entity. The four ops (per Source SDK `PVS_*` constants) are: `0` = update-in-place, `1` = leave-PVS (no class change possible), `2` = enter-PVS / new-create (this is where re-create happens), `3` = delete + leave-PVS combined. The class-change check fires inside the create branch of the entity loop, BEFORE allocating storage:

```
on op = 2 (enter-PVS):
  newClassId = readClassId()                    // serial bits (variable, see Section 4)
  newSerial  = readSerialBits()
  existing   = entityList.slots[entityId]
  if existing !== undefined:
    if existing.serverClassId !== newClassId:
      throw EntityClassMismatchError(entityId, existing.serverClassId, newClassId)
    // Same class: free old storageSlot to that class's freeList,
    // then allocate a fresh storageSlot. Same observable as a delete+create.
  // ... allocate storage slot, apply baseline, apply create delta
```

This matches ADR-002's amendment: "if `enter-PVS` arrives for an existing entity id with a different `serverClassId` than the slot currently holds, we throw `EntityClassMismatchError` and surface it as a parser error." Throw a typed error class extending `Error`; consumer catches it via the `error` event on the parser.

## Section 3 — Event payload semantics (the ADR-003 punted question)

**Decision: option (c), the lazy-view `Entity` object that proxies reads to live storage and tracks slot version.**

(a) is rejected because the mutation footgun is exactly the consumer pain ADR-002's amendment flagged (~"consumers who hold references past a tick still see mutation"). (b) is rejected because per-event prop-by-prop snapshots of a 1745-prop CCSPlayer at every `entityUpdated` is 14 KB of allocation per event × tens of events per tick × 65000 ticks per demo = gigabytes of GC pressure. We get neither cache locality nor zero-copy benefit.

(c) gets us zero-copy at emission time AND a loud failure mode for stale references. Consumers who want a snapshot can build one themselves (a `snapshot()` method is a M3 helper, not an M2 obligation).

**`Entity` view interface.**

```ts
export interface Entity {
  readonly id: number;
  readonly serverClass: ServerClass;
  readonly serialNumber: number;
  /** 'active' (in PVS, getting updates), 'dormant' (left PVS, last-known values
   *  intact, may re-enter), 'free' (deleted; reads throw StaleEntityError). */
  readonly state: 'active' | 'dormant' | 'free';
  /** O(1) typed read by flattened-prop index. Returns undefined for never-
   *  written props. Throws StaleEntityError if the slot has been recycled. */
  prop(index: number): PropertyValue | undefined;
  /** Convenience: name → index lookup, then prop(). O(propCount) the first
   *  time per name (cached on ServerClass), O(1) thereafter. */
  propByName(name: string): PropertyValue | undefined;
  /** Iterate (index, value) for written props only. */
  entries(): Iterable<readonly [number, PropertyValue]>;
}
```

Implementation: `Entity` is a small class holding `(entityList, entityId, storageSlot, slotVersion)`. All reads route through `entityList.entityStores[serverClassId].read(storageSlot, propIndex)` after a one-line slot-version check. No prop-array allocation. No name hash on the hot path. M3's state overlays will cache `propByName` indices once and use `prop(index)` thereafter — same access pattern as demoinfocs-golang.

**Event payload type:**

```ts
interface DemoParserEvents {
  // ...existing events from ADR-003
  entityCreated:  Entity;
  entityUpdated:  Entity;
  entityDeleted:  Entity;  // view valid only inside the listener
}
```

The `entityDeleted` payload is special: the slot has just been freed, but for the duration of the synchronous emit() call, the slot version on the view still matches the store's version-at-delete-minus-one. We arrange this by emitting BEFORE incrementing the slot version. Consumer can read final values; consumer cannot escape the listener with a still-valid reference.

## Section 4 — PacketEntities wire format

**Decision: implement the algorithm exactly as `markus-wa/demoinfocs-golang` does in `pkg/demoinfocs/datatables.go::handlePacketEntities` and `pkg/demoinfocs/sendtables/entity.go::ApplyUpdate`. Do not re-derive from the Source SDK; the M2 lessons banked from ADR-001 (priority sort) and TASK-018a (priority-140 within-bucket order) all came from staying close to demoinfocs.**

`CSVCMsg_PacketEntities` carries:
- `max_entries: int32` (max edicts the demo expects)
- `updated_entries: int32` (count to read)
- `is_delta: bool`
- `update_baseline: bool`
- `baseline: int32` (which baseline index to use, 0 or 1, for full-update parity)
- `delta_from: int32` (tick we're delta-from; -1 for full update)
- `entity_data: bytes` (the bit-stream payload — your job)

The `entity_data` blob is read via `BitReader`. Algorithm (entity loop):

1. `entityIndex = -1` (note: NOT 0 — the deltas are computed against -1 to get a 0-indexed first entity).
2. Repeat `updated_entries` times:
   - **Header.** Read entity-index delta as a CS:GO-style varint over bits: read 4 bits as `headerBits`. If `headerBits === 0xF`, read another 28 bits and treat as full int32 delta. Otherwise the encoding is: 0–2 bits → 4-bit base, 3 bits → 4+8-bit, 6 bits → 4+16-bit. Reference: `demoinfocs-golang/pkg/demoinfocs/sendtables/entity.go::readFieldIndex` and `bitread.go::ReadUBitInt`. Add 1 to the delta and apply: `entityIndex += (delta + 1)`.
   - **Op flags.** Read 2 bits. Enum:
     - `0b00` (`PVS_PRESERVE`): update existing entity; no class change.
     - `0b01` (`PVS_LEAVE`): mark dormant; no prop data follows for this entity.
     - `0b10` (`PVS_ENTER`): create new (or re-create) at this index. Class+serial follow.
     - `0b11` (`PVS_LEAVE | PVS_DELETE`): mark dormant AND delete the slot. Both events fire.
   - **For `PVS_ENTER`:** read `bitsForClassId = ceil(log2(serverClassCount + 1))` bits — class id; read 10 bits — serial number. Resolve `ServerClass`, run the class-change check (Section 2), allocate a storage slot from that class's `EntityStore`, **apply baseline (Section: TASK-025)** by replaying the cached `instancebaseline` blob's prop writes against the new slot, then fall through to the changed-prop-index loop to apply the create delta. Emit `entityCreated` after.
   - **For `PVS_PRESERVE`:** no class/serial; fall through directly to the changed-prop-index loop. Emit `entityUpdated` after.
   - **For `PVS_LEAVE`:** mark `state = 'dormant'`; do NOT free storage; do NOT clear `written`. M3's state overlays may still want to read last-known position. No prop data follows. No event in M2 (TASK-027 may add a `entityLeftPVS` event; out of scope here).
   - **For `PVS_LEAVE | PVS_DELETE`:** run the delete path (Section 2) and emit `entityDeleted`. This is TASK-027's territory but you wire the dispatch here.

3. **Changed-prop-index loop ("new way" encoding).** This is the trickiest decode in M2. Reference: `demoinfocs-golang/pkg/demoinfocs/sendtables/entity.go::readFieldIndices`. Algorithm:

```
fieldIndex = -1
loop:
  hasNext = readBool()             // 1 bit
  if !hasNext: break
  delta = readUBitVar()            // CS:GO 4/8/12/32-bit varint
  fieldIndex += delta + 1
  changedProps.push(fieldIndex)
```

Then for each `changedProps[k]`, look up `serverClass.flattenedProps[k]`, dispatch to `decodeProp(reader, prop)` (TASK-019/020/021), then write the result via `entityStore.write(storageSlot, k, value)`. The write routes to the right typed-array column via the precomputed `propColumns[k]`.

**Cursor leak prevention.** Per the M2 pre-mortem #4: every prop decoder unit test asserts the BitReader cursor advanced by exactly the expected bit count. Add an integration assert: at end of `entity_data` payload, BitReader cursor must equal `entity_data.length * 8` (or within a 7-bit byte-pad, since the protobuf field is byte-aligned). Mismatch ⇒ `BitStreamMisalignmentError`.

**Baseline application in TASK-025/026 boundary.** `instancebaseline` arrives as a string-table entry keyed by `String(classId)` with a binary blob payload. On first entity-create of class C, decode the blob lazily through C's flattened props (same changed-prop-index decoder, applied to a synthetic "all-props" delta — the baseline IS a complete prop set), cache as `serverClass.cachedBaseline: { props: number[], values: PropertyValue[] }`. Subsequent creates replay the cached prop writes against the new slot — no re-decode of the bits. This is TASK-025's deliverable; TASK-026 calls into it.

## Section 5 — Test plan (anti-cheat, milestone-level)

The architect's #1 fear is silent flattening or column-mapping corruption that surfaces in M5. TASK-026 is where it would surface. Required integration tests, written as part of TASK-026, runnable on `test/fixtures/de_nuke.dem`:

1. **World entity exists.** Parse to the first packet message after signon. `parser.entityList.get(0)?.serverClass.className === 'CWorld'`. If this fails, the entity-id delta or class-id read is off — likely the `+1` fencepost from the M2 pre-mortem #3.

2. **CCSPlayer exist with sane team.** Find at least one entity with `serverClass.className === 'CCSPlayer'`. Read `m_iTeamNum` (flat prop index 1175 per the golden dump). Assert `value === 2 || value === 3` (T or CT; 0=unassigned, 1=spectator are valid in CSGO but post-spawn we expect a team). If this fails, the column-mapping is misaligned — `m_iTeamNum` is at index 1175, deep in the prop list, and a flattening error of even one position shifts it.

3. **CCSPlayer has plausible origin.** Read `m_vecOrigin` (CCSWeapon... actually it's at flat prop index 6 on CCSPlayer per the dump, type Vector). Assert `Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)` and `Math.hypot(x, y, z) < 10000` (de_nuke fits in a ~4000-unit cube; 10000 is generous). NaN ⇒ the float decoder TASK-020 is broken; magnitude blowup ⇒ quantized float rounding is wrong (M2 pre-mortem #5).

4. **Weapon m_iClip1 is plausible.** Find an entity whose serverClass extends from a weapon class (e.g., `className.startsWith('CWeapon')` or includes `AK47`/`M4A1`/etc.). Read `m_iClip1` — golden dump shows it at idx 497 on CWeaponCSBase with `nBits=8 UNSIGNED`. Assert `value >= 0 && value <= 200`. Out of range ⇒ Int decoder UNSIGNED handling is broken.

5. **Cursor lands at end-of-payload.** After dispatching one full PacketEntities message, assert `bitReader.position === entityDataLength * 8` (modulo final 0–7 padding bits). Catches the bit-stream cursor leaks the M2 pre-mortem flagged.

6. **EntityClassMismatchError is throw-tested with a fixture.** Construct a synthetic PacketEntities byte sequence that re-creates entity 5 with a different class ID after a previous create. Confirm the parser throws `EntityClassMismatchError` with the expected (entityId, oldClassId, newClassId) fields. This is a unit test, not a real-demo test — de_nuke probably never trips it.

7. **`written` bitset gating works.** Allocate an entity, write only props 3 and 7, read prop 5. Expect `undefined`, not `0` or `NaN`. This catches the silent-zero failure mode where a never-written `Int32Array` cell decodes as 0 and the consumer can't tell.

These tests live in `test/integration/entities/` (new directory). They share a fixture-loading helper with the existing `frame.test.ts` and `serverinfo.test.ts`. Run on every PR via the existing vitest config.

## Section 6 — Files-touched plan, in implementation order

The developer should implement roughly top-to-bottom; each step builds on the previous and ends at a runnable, testable unit.

1. **`src/entities/EntityStore.ts`** (new) — the per-class struct-of-arrays bundle with column allocation, slot allocation/free, lazy bitset reads, capacity doubling. Pure data structure — no parser dependencies. Unit tests in `test/unit/entities/EntityStore.test.ts`. Bench-able in isolation.

2. **`src/entities/Entity.ts`** (new) — the lazy view class (Section 3). Holds `(entityList, id, storageSlot, slotVersion)`, exposes `prop(i)`, `propByName(s)`, `entries()`. Pure read-side. Unit tests verify `StaleEntityError` and `propByName` caching.

3. **`src/entities/EntityList.ts`** (new) — top-level `EntityList` class with `slots: (Entity | undefined)[]` of length `MAX_EDICTS=2048`, `get(id)`, `create(id, classId, serialNumber)`, `update(id, propWrites)`, `delete(id)`, `leavePVS(id)`. Owns the routing from entity id → ServerClass → EntityStore.

4. **`src/datatables/ServerClass.ts`** (modify) — add `entityStore: EntityStore | null` (lazy), `propColumns: PropColumn[]`, `cachedBaseline?: { propIndices: number[], values: PropertyValue[] }`. Add a small helper `computePropColumns(flattenedProps)` exported from a sibling file or inlined into `ServerClassRegistry`. Existing field shape unchanged for backward-compat.

5. **`src/entities/PacketEntitiesDecoder.ts`** (new) — TASK-026's core. Exports `decodePacketEntities(msg: CSVCMsg_PacketEntities, deps: { entityList, serverClassRegistry, baselineStore, propDecoder, emit })`. Implements the entity loop (Section 4). Synchronously emits `entityCreated` / `entityUpdated` / `entityDeleted` via the `emit` callback. Holds no state itself (pure function over its deps).

6. **`src/entities/EntityChangeEvents.ts`** (new) — type definitions only: `EntityCreatedEvent = Entity`, etc. The actual emission lives in DemoParser. This file is mostly there to keep the public-event-type surface in one place when M3 expands it.

7. **`src/entities/index.ts`** (new) — barrel: `export { EntityStore, Entity, EntityList, decodePacketEntities, EntityClassMismatchError, EntityNotFoundError, StaleEntityError, BitStreamMisalignmentError }`.

8. **`src/packet/MessageDispatch.ts`** (modify) — register `SVCMessages.svc_PacketEntities` with `CSVCMsg_PacketEntities` decoder + new `onPacketEntities?` handler. One entry to the registry, one handler-key to the interface. ~6 lines.

9. **`src/DemoParser.ts`** (modify) — wire the decoder. Construct an `EntityList` and a `BaselineStore` once after datatables-ready. Bind `onPacketEntities` to a method that calls `decodePacketEntities(...)`. Add the three new events to the `DemoParserEvents` typed event map.

10. **`src/index.ts`** (modify) — public exports: `EntityList`, `Entity` (the interface), the four error classes. Do NOT export `EntityStore` or `PacketEntitiesDecoder` — those are internal.

Order rationale: 1–3 are pure data structures, no parser dependencies, fully testable in isolation; if any of them is wrong we catch it before any wire bytes touch them. 4 is a small amendment to existing code. 5 is the integration point — by the time you write it, every collaborator (`EntityList`, `EntityStore`, `propDecoder`, baselines) is already merged. 6–10 are wiring.

## Section 7 — Open questions / RESEARCH NEEDED (do not block on these)

- **TASK-018a (priority-140 within-bucket order).** TASK-026 must NOT validate this — it is TASK-018a's responsibility to fix if the bucket-internal order is wrong. But if integration test #2 (`m_iTeamNum` at idx 1175 ⇒ team ∈ {2,3}) starts failing on a clean de_nuke run after TASK-018a lands, that is TASK-018a's signal, not yours. Flag it in the PR description and ping the architect.

- **`Entity` view as public API surface.** Open question for M3: do we expose `Entity` as the consumer interaction point (low-level, indexed, fast), or do we hide it behind state overlays and only expose typed `Player` / `Weapon` / etc. classes? Defer to M3. Implementation note: do NOT add `Entity` to the public README or to the documented surface in M2 — keep it internal-ish so M3 can change shape without a breaking-change discussion.

- **`Float32Array` vs `Float64Array` for the float column.** ADR-002's open question. Spec says f32; profiling in M3 may say f64. Do not pre-optimize — start with f32 because that matches the wire format's bit precision (8–17 bit quantized; even unquantized NOSCALE is f32 on the wire).

- **Sparse `arrays` column.** Only 2 array props in the entire dump (1 on CCSPlayer, 1 on CCSGameRulesProxy). The boxed `(PropertyValue[] | undefined)[]` is fine. M7 profiling may show it doesn't matter; do not optimize.

- **MAX_EDICTS.** ADR-002 says 2048. Confirm empirically by logging the max entity index seen during a full de_nuke parse. If it's noticeably lower (say 256), `EntityList.slots` can shrink, but it's a pure memory micro-optimization — not blocking.

---

## Final notes for the developer

- **Reference parser on every uncertainty.** `markus-wa/demoinfocs-golang` v3 commit `a68aa2fbae5...` (the same commit our protos pin) is the practical authoritative source. When in doubt about a bit pattern, an op flag, or a delta encoding, look there before you reason from the Source SDK. The M2 banked lessons (ADR-001, TASK-018a research) all credit this repo.
- **Don't gold-plate the bitset code.** `Uint32Array` ops with `>>> 5` for word index and `& 31` for bit index are fast, idiomatic, and obvious. Resist the urge to write a `Bitset` class with a fluent API — duplication beats the wrong abstraction (Metz).
- **The changed-prop-index decoder is the trickiest single piece of code in this task — ~30% of your time will go there.** Unit-test it in isolation against a hand-constructed byte sequence with known field deltas before you wire it into the entity loop. The M2 pre-mortem flagged this exact decoder as the bit-cursor-leak hotspot.
- **Tests are yours.** Write them as you go. Reviewer will confirm they exist and that production code is honest (no hardcoded return values).
