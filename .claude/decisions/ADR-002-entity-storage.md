# ADR-002: Entity Property Storage

> Status: AMENDED 2026-04-29 (see amendment at bottom — original decision SUPERSEDED) | Author: architect | Date: 2026-04-28
> Scope: TASK-026, TASK-027 (consumed by all of M3, M4, M6)

## Decision

We store decoded entity property values as a per-entity flat array of
`PropertyValue | undefined`, where the array is sized to exactly the
length of the entity's ServerClass's `flattenedProps` array — option (c)
in the brief. The full storage shape is:

```ts
class Entity {
  readonly id: number;            // 0..2047
  classId: number;                // mutable: cleared on delete, reassigned on enter-PVS
  serialNumber: number;
  serverClass: ServerClass;       // canonical, cached for O(1) decode
  properties: (PropertyValue | undefined)[]; // length = serverClass.flattenedProps.length
  state: EntityState;             // 'active' | 'dormant' | 'free'
}

class EntityList {
  private readonly slots: (Entity | undefined)[] = new Array(2048);
  get(id: number): Entity | undefined { return this.slots[id]; }
  // create / update / delete / leavePVS / enterPVS
}
```

A new `Entity` instance is allocated when an entity ID is first used and
**reused in place** across delete/recreate cycles when the new entity is
the same class (typical for player slots that respawn). When the new
entity is a different class, the existing `properties` array is
discarded and a fresh one of the new class's length is allocated.

We rejected option (b) — a single global flat array indexed by
`(entityId * propsPerClass) + propIndex` — for the gotchas section
below. We rejected option (a) — name-keyed `Record<string,
PropertyValue>` — because it allocates per write and forces a string
hash on the hottest decode path.

## Why

Three constraints from CLAUDE.md drive the choice:

1. **Streaming-first, constant memory, no tick history.** We never keep
   per-tick snapshots; the latest-known value of each property is the
   only state. This means total live memory is bounded by
   `2048 entities × avgPropsPerClass × bytesPerValue`, which is small
   (~5MB) regardless of demo length.
2. **O(1) property access by index.** PacketEntities decoding reads a
   prop index off the wire and writes the decoded value at that index.
   No name lookup, no Map, no hashing. The flattened-props array
   produced by ADR-001 already gives us a stable index, so we mirror
   that index into the entity's property storage.
3. **No `any` in the public API.** The `PropertyValue` union is
   `number | bigint | string | Vector3 | PropertyValue[]` — concrete
   primitives, no escape hatch.

Why option (c) (per-entity array sized per-class) rather than option (b)
(global flat array of `MAX_ENTITIES × MAX_PROPS_PER_CLASS`):

Option (b) has the appeal of one big `Float64Array`-style allocation —
extreme cache locality, no per-entity allocation. But CSGO's max prop
count varies wildly across classes: `CCSPlayer` has ~250 props, an
in-flight grenade has ~30, a smoke particle effect has ~10. Sizing
the global array to 250 means every grenade entity wastes 220 slots.
With 2048 entities that's ~440K wasted slots × 8 bytes per slot ≈ 3.5MB
of permanently allocated, never-touched memory. The savings from one
big allocation are smaller than that waste, especially since modern V8
allocates plain arrays in a way that gives us roughly equivalent locality
for the *active* slots.

More importantly, option (b) breaks down when an entity changes class
mid-demo (a known-rare but legal Source-engine event: enter-PVS on a slot
previously occupied by a different class). The global-array index
formula assumes all slots have the same prop count — they don't. We
would need a per-class offset table, at which point we have reinvented
option (c) with worse ergonomics.

Option (a) is the obvious wrong choice but worth naming: a
`Record<string, PropertyValue>` per entity allocates a new string entry
for every property write, garbage-collects on every overwrite, and turns
"set property at index 17" into "hash 'm_vecOrigin[0]' to a bucket."
The decode loop runs millions of times per demo. This is the slow path
we are explicitly avoiding.

## Gotchas

### Class change on a reused slot

When an entity at slot 7 is deleted and a new entity at slot 7 is created
with a *different* class:

```
oldEntity.serverClass.flattenedProps.length === 50   (was a smoke grenade)
newEntity.serverClass.flattenedProps.length === 250  (now a player)
```

The decoder must allocate a fresh `properties` array of length 250 —
reusing the 50-element array would silently truncate any prop with index
>= 50. The fix is in `EntityList.create()`: if `existingEntity.classId
!== newClassId`, replace `existingEntity.properties` with
`new Array(newClass.flattenedProps.length)`. This is a one-line check
but the failure mode if forgotten is silent index-out-of-bounds reads
returning `undefined` for valid props.

### Eviction strategy on delete

Per Source semantics, a deleted entity's slot is immediately available
for reuse. Two valid strategies:

1. **Drop the Entity reference**: `slots[id] = undefined`. New entity at
   the same slot allocates a fresh `Entity` instance.
2. **Pool the Entity**: keep the instance, mark `state = 'free'`, reset
   `properties` lazily on next create.

We pick strategy 1 for simplicity in M2. If GC pressure shows up in M7
profiling, we revisit. Strategy 2 is a Type 2 decision (reversible by
swapping out the EntityList implementation behind its public methods).

### Dormant entities (leave-PVS)

The leave-PVS operation marks an entity as not-being-updated but
not-deleted. The properties array remains intact and readable — players
that walk out of view of the recording client still have a last-known
position, health, etc. We model this with `state = 'dormant'`. M3's
state overlays must check `state === 'active' || state === 'dormant'`
when deciding whether an entity is "alive in the world," and treat
`state === 'free'` as a deleted slot.

### Mutable references in event payloads

`entityCreated` / `entityUpdated` / `entityDeleted` events fire with the
`Entity` instance as payload. Because we reuse Entity instances across
ticks (and across delete/recreate cycles for the same slot), a consumer
that holds the reference past the next tick will see properties mutate
under them. This is consistent with `demoinfocs-golang`'s API but is a
trap for newcomers. In M3 we will either (a) document this loudly, or
(b) add a `snapshot()` method to Entity for consumers who want a frozen
copy. We do not solve this in M2 — the events are not yet part of any
documented public surface.

## Alternatives Considered and Rejected

**Option (a): Per-entity `Record<string, PropertyValue>`.** Rejected
because the decode loop runs ~10^7 times per demo and string-keyed
property writes allocate. Even with V8's hidden-class optimization for
stable shapes, our prop schemas are not stable at the type level —
different ServerClasses have different prop names — so V8 cannot
monomorphize across classes. We pay the dictionary-mode penalty.

**Option (b): Single global flat array indexed by `(entityId *
maxPropsPerClass) + propIndex`.** Rejected for the wasted-memory
argument above (3.5MB permanent waste in CSGO) and because it breaks
down on class change on slot reuse. Worth revisiting if M7 profiling
shows that per-entity array allocation is a hot path — but the
allocation only happens at entity *create*, not at *update*, so it
shouldn't be.

**Option (d): Object instances with named getters per ServerClass,
generated dynamically.** Rejected because dynamic class generation
fights V8's optimizer (every demo has different ServerClass shapes,
so the optimization tier never warms up) and because consumer access
in M3 is index-based anyway (the Player overlay caches the prop index
once and reads `entity.properties[idx]`).

## Open Questions

- `RESEARCH NEEDED:` What is the actual maximum entity index in CSGO
  demos? `MAX_EDICTS = 2048` per the engine, but CS-specific demos may
  cap lower. If lower, the slot array can be smaller. Easy to discover
  empirically once TASK-026 lands and we run de_nuke through the parser.
- `RESEARCH NEEDED:` Does the Source engine guarantee that an enter-PVS
  on an existing dormant slot keeps the same class, or can a slot
  change class on enter-PVS without going through delete? If the latter,
  the class-change check above must also fire on enter-PVS, not only
  on create. Check `demoinfocs-golang`'s `Parser.handleEnterPvs`
  before merging TASK-027.

---

## 2026-04-29 Amendment

> Status: REPLACES the per-entity-array decision above. | Trigger: `.claude/research/golden-flat-props.md` landed with empirical prop counts from `demoinfocs-golang` against `test/fixtures/de_nuke.dem`.

**We now choose a per-class struct-of-arrays bundle keyed on (entitySlot, propIndex) with primitive-typed columns (Int32Array / Float32Array / interleaved Vector Float32Array / `string[]`), allocated lazily per ServerClass on first instantiation, because the empirical 1745-prop CCSPlayer table makes per-entity boxed arrays cost ~7x more memory and lose the cache locality that 85% Int density would otherwise hand us for free.**

### What changed

The original ADR was sized against an assumed `CCSPlayer ≈ 250 props`. The golden dump (BLUF + per-class headers) shows the real counts on de_nuke: **CCSPlayer = 1745**, **CWeaponCSBase = 515**, **CCSGameRulesProxy = 1126**, **CCSTeam = 16**, with 284 ServerClasses declared overall. The CCSPlayer table is 1481 Int / 234 Float / 24 Vector / 2 VectorXY / 3 String / 1 Array — 85% integer-typed props. The bulk of the inflation comes from Source flattening fixed-size arrays into per-index entries: rows 1480–1745 are entirely `m_iMatchStats_*` expansions (`m_iMatchStats_RoundResults.NNN`, `m_iMatchStats_Deaths.NNN`, etc., one prop per round across 26 stat fields × 15 rounds visible at index 1358 onward), plus `m_EquippedLoadoutItemDefIndices` (57 entries) and `m_AnimOverlay.NNN.*` (15 overlays × 7 sub-props ≈ 105 entries near indices 26–119).

### Why the original decision no longer holds

The original ADR-002 budget — `2048 entities × ~250 props × 8 bytes ≈ 4 MB total` — has to be re-checked at the real scale. The naive per-entity-array shape, with `(PropertyValue | undefined)[]` of length matching the class, costs:

- **CCSPlayer at full slot occupancy:** 1745 props × 64 V8-boxed slots ≈ 14 KB per entity × 64 plausible player-class entities ≈ 900 KB just for player state — mostly empty `undefined` slots. Per-entity allocation, but the array itself isn't the problem.
- **Whole-demo cap if we kept the global "size to max class" assumption (option b in original ADR):** 1745 × 2048 × 8 ≈ 28 MB permanently allocated for the player class alone. CCSGameRulesProxy: 1126 × 2048 × 8 ≈ 18 MB even though *only one CCSGameRulesProxy ever exists* in a demo. Confirmed: option (b) is dead, exactly as the original ADR predicted, just with bigger numbers.
- **The boxed-array shape we picked (option c):** every property write that survives wraps the value in V8's hidden-class-tracked element kind. With 1481 of 1745 CCSPlayer props being plain integers, putting them in an `Int32Array` is free (no boxing, monomorphic ArrayBuffer math) and cuts the memory by 4x vs. boxed numbers (V8 typically stores even SMI-eligible numbers as 8 bytes in a holey array). The 85% integer density makes this a one-way door: typed arrays win.

The original concern — that per-class flat sizing wastes memory for sparse classes — is now *more* acute (CCSGameRulesProxy is 1126 props with one instance), and is what forces the new design's lazy-allocation and per-class capacity-sizing rules below.

### New layout

For each `ServerClass`, we precompute at flatten time three integer counts and an index map: `numIntProps`, `numFloatProps`, `numVectorProps`, plus `propIndex → (kind, columnIndex)`. The class then owns:

```ts
class ClassStorage {
  // Width = numIntProps. Length = numIntProps × capacity.
  ints: Int32Array;
  // Width = numFloatProps. Length = numFloatProps × capacity.
  floats: Float32Array;
  // Width = numVectorProps × 3 (interleaved x,y,z). VectorXY uses 2 lanes; Z lives elsewhere per Source's split (see m_vecOrigin/m_vecOrigin[2]).
  vectors: Float32Array;
  // Sparse: 3 props on CCSPlayer, 0 on most other classes.
  strings: (string | undefined)[];
  // Bitset of which slots are occupied; covers lazy-clear semantics.
  occupied: Uint8Array;
  // Bitset of which (slot, prop) pairs have ever been written. Sized
  // (capacity * propCount + 7) >> 3. Lets us return undefined for
  // never-written props without inventing a sentinel value.
  written: Uint8Array;
  capacity: number; // grows by doubling
}
```

A read for entity `slot`, prop `i` consults `propIndex[i]` to get `(kind, col)`, indexes into the right typed array at `slot * widthForKind + col`, and checks `written` to disambiguate `0` from "never set". A write does the inverse and sets the `written` bit. No allocation per write. No string keys. No object boxing for 99.9% of property traffic.

The `Entity` record is downgraded to identity only:

```ts
class Entity {
  readonly id: number;             // 0..MAX_EDICTS-1
  serverClassId: number;
  serialNumber: number;
  state: 'active' | 'dormant' | 'free';
  storage: ClassStorage;           // pointer to the bundle for serverClassId
  storageSlot: number;              // index INTO ClassStorage, NOT entity id
}
```

Crucially, `storageSlot` is allocated by the `ClassStorage` itself, not equal to the entity id. This is the lever that fixes sparse-occupancy waste: CCSGameRulesProxy's bundle never grows past `capacity = 1`. CCSPlayer's grows to perhaps 64. The mapping from entity id (the wire-protocol slot number, 0..2047) to (`ClassStorage`, `storageSlot`) lives in `EntityList.slots: (Entity | undefined)[]`. Wire-side decoding still indexes by entity id; storage-side allocation is class-scoped.

### Slot lifecycle (eviction)

We pick **lazy overwrite on first write**, not eager zero on delete. When entity 5 is deleted, `ClassStorage` marks `storageSlot` of that entity as free (push onto a small free-list) and clears the row's `written` bitset (`written.fill(0, slot*propCount, (slot+1)*propCount)`) — a tight memset, ~1745 bits = 218 bytes for CCSPlayer, dominated by L1 cache cost. The actual `Int32Array` data stays dirty. When a new entity claims the slot, the cleared `written` bitset means every read returns `undefined` until first write, which is the same observable behavior as a freshly allocated row. We do not zero the typed-array data because (a) we'd be writing thousands of bytes to clear data nobody will read until written, and (b) the `written` bitset is the source of truth.

Eager zero is rejected because it's strictly more work for no observable difference. The argument for eager zero would be defense-in-depth against bugs that read `written=false` slots — that's a unit-test-and-review concern, not a runtime concern.

### Failure modes (replaces the original "Gotchas" — but keep that section above for history)

**Class change on a reused entity id.** When the same wire entity id (e.g., 7) is deleted and re-created with a different ServerClass, the new code path is: `EntityList.delete(7)` returns the old `storageSlot` to the old class's free-list. `EntityList.create(7, newClassId)` allocates a fresh `storageSlot` from the *new* class's `ClassStorage`. The two are unrelated. This is *simpler* than the original ADR's "in-place class swap" because storage slots are no longer 1:1 with entity ids. A re-use that keeps the same class is the fast path: the old `storageSlot` is reused only after free-list pop, with `written` already cleared at delete time.

**Entity changes ServerClass without going through delete.** The original ADR flagged this as `RESEARCH NEEDED`. With the per-class layout, we close the question by **forbidding it**: if `enter-PVS` arrives for an existing entity id with a different `serverClassId` than the slot currently holds, we throw `EntityClassMismatchError` and surface it as a parser error. Source's wire protocol does not document this transition; demoinfocs-golang does not handle it; the cost of supporting it is non-trivial (free old slot + allocate new slot + emit synthetic delete/create events). Throw now, revisit if a real demo trips it.

**Sparse occupancy** (CCSGameRulesProxy: 1126 props × 1 entity). Solved by per-class `capacity` that **starts at 1 and grows by doubling**. CCSGameRulesProxy stays at capacity=1 forever (one instance). CCSTeam grows to 2 (CT, T, plus possibly 'spectator' and 'unassigned' — 4 max). CCSPlayer caps at ~64. Worst case is something like CCSRagdoll or projectile classes that may briefly exceed expectation; `capacity` doubling is amortized O(1) and the typed-array re-allocation copies only the active prefix. We do *not* down-size on free — once doubled, capacity stays. M7 profiling can revisit if we see a class that briefly spikes to 1000 storage slots and never reclaims.

**Dynamic typed-array growth on doubling.** When a `ClassStorage` doubles, all three typed arrays (ints, floats, vectors) and both bitsets must be reallocated and copied. This is a hot-path-adjacent O(N) operation. Mitigation: pre-size from `ClassInfo` heuristics — for `CCSPlayer` start `capacity = 32`, for `CCSGameRulesProxy` start `capacity = 1`, for everything else start `capacity = 4`. The heuristic table lives in `EntityList` config and is tunable. Open question for M7 profiling: should we pre-size based on demo-declared ServerClasses count? Probably not — wasted memory if class is never instantiated.

**Capacity exhaustion under pathological demos.** A demo that spawns thousands of transient projectile/grenade entities can blow `capacity` for a single class. We do not cap — typed arrays grow as needed. Hard ceiling is V8's typed-array max (`2^32 - 1` bytes), which we are nowhere near. Soft warning at `capacity >= 1024` for any single class would be useful in dev mode; logged once.

**Mutable references in event payloads — unchanged.** The `Entity` instance is still recycled across delete/recreate cycles for the same entity id. The amendment doesn't change this. Consumers who hold references past a tick still see mutation. Snapshot helper deferred to M3, same as before.

### Decision restated at top of amendment

**We now choose a per-class struct-of-arrays bundle keyed on (entitySlot, propIndex) with primitive-typed columns (Int32Array / Float32Array / interleaved Vector Float32Array / `string[]`), allocated lazily per ServerClass on first instantiation, because the empirical 1745-prop CCSPlayer table makes per-entity boxed arrays cost ~7x more memory and lose the cache locality that 85% Int density would otherwise hand us for free.**

Memory math at the new scale, per-class bundle, capacity-tuned:
- CCSPlayer: (1481 Int × 4) + (234 Float × 4) + (24 Vector × 12) + (2 VectorXY × 8) + (3 String × ~32) ≈ 7.2 KB **per slot** × 64 slots ≈ 460 KB. Compared to the boxed-array prior estimate of ~900 KB, a 2x improvement — and these are the bytes the decoder actually touches, so cache locality is also better.
- CCSGameRulesProxy: (~1126 Int × 4) ≈ 4.5 KB × 1 slot = 4.5 KB. Compared to a 1126 × 2048 × 8 = 18 MB option-b nightmare, three orders of magnitude better.
- CCSTeam: ~64 bytes × 4 = 256 bytes.
- 280 other ServerClasses: most never instantiated; the ones that are (CHostage, CCSRagdoll, CWeapon* projectiles) trace to small prop counts. Total under 5 MB at full demo occupancy.

### Open questions for the developer (M2 / M3)

- `RESEARCH NEEDED:` confirm `MAX_EDICTS` for CSGO demos empirically once TASK-027 lands. Original ADR's `2048` is the engine cap; if real demos cap lower, the `EntityList.slots` array can shrink, but the per-class storage decision is unaffected.
- `RESEARCH NEEDED:` benchmark `Float32Array` vs `Float64Array` for the float column. CSGO send-prop floats are mostly 8–17 bit quantized; we lose nothing by storing them as f32, but profiling should confirm M3's state overlays don't read them and re-quantize. If state overlays compute deltas in f64, store in f64 to avoid round-trip cost.
- `RESEARCH NEEDED:` does any class need a `BigInt64Array` column for a 64-bit prop? Scan the dump for `nBits == 64`. If zero, drop the column; otherwise add a fifth typed array.
