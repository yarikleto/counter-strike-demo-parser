# M2 Plan: Core Protocol (TASK-013 — TASK-027)

> Author: architect | 2026-04-28 | Status: PROPOSED

## Charter

M2 is the milestone where this library stops being a frame iterator and becomes
a parser. Its single job: take a `de_nuke.dem` fixture, walk it from the first
frame to `dem_stop`, and produce, on demand, a coherent picture of every
networked entity in the game world. Concretely, when M2 ships, given any tick
T encountered during streaming, the parser will hold an `EntityList` such that
asking "where is entity 3 (a CCSPlayer) right now?" returns a `(x, y, z)`
vector that matches Valve's reference output. There is no public game-state
API yet — that is M3 — but the bedrock is laid: SendTables parsed,
ServerClasses registered, props flattened, baselines decoded, entities
created/updated/deleted via PacketEntities, with `entityCreated`,
`entityUpdated`, `entityDeleted` events emitted synchronously through the
typed event emitter. M2 is the heart of the parser because every milestone
downstream (player overlays, kill events, grenade tracking, golden tests)
trusts that the entity properties this milestone produces are correct. Get M2
right and the rest is bookkeeping. Get it wrong and every consumer silently
sees garbage.

## Subsystem Breakdown

The fifteen tasks decompose into six subsystems with clean boundaries. The
boundaries are deliberate — each subsystem can be reasoned about, tested, and
reviewed in isolation, and the failure mode of one subsystem rarely cascades
into another at runtime (only at integration time).

**1. Schema ingestion (TASK-013, TASK-014).** Owns the parsing of
`CSVCMsg_SendTable` and `CSVCMsg_ClassInfo` from the `dem_datatables` frame.
Outputs: a `Map<string, SendTable>` of all tables by `netTableName`, and a
`ServerClass[]` indexed by class ID with each entry pointing to its root
SendTable. Pure data ingestion — no decoding logic, no flattening. This is
the dictionary the rest of M2 reads from.

**2. SendTable flattening (TASK-015 — TASK-018).** Owns the four-pass
flattening algorithm that converts a tree of SendTables into the
`FlattenedSendProp[]` decode template attached to each ServerClass. Outputs
one such array per ServerClass. This subsystem is functionally pure — given
identical SendTables it produces identical output — which makes it the most
unit-testable component in the parser. It is also the one most likely to be
silently wrong; see ADR-001 for the algorithm and the priority sort
tie-breaker that nobody discovers they got wrong until entity decode is
already broken.

**3. Property decoders (TASK-019, TASK-020, TASK-021).** Owns a single dispatch
function `decodeProp(reader: BitReader, prop: FlattenedSendProp): PropertyValue`
backed by per-type sub-decoders. The decoders are pure functions over the
BitReader, no entity state, no class registry. They consume bits and return
`number | bigint | string | Vector3 | PropertyValue[]`. Layer 1 (BitReader)
already provides the primitives this subsystem orchestrates.

**4. String tables (TASK-022, TASK-023, TASK-024).** Owns `CreateStringTable`,
`UpdateStringTable`, the history-based string encoding, and Snappy
decompression. Outputs a `StringTableManager` with `getTable(name)` /
`getTable(id)` and emits `stringTableCreated`/`stringTableUpdated` events.
The `instancebaseline` and `userinfo` tables are the consumers M2 cares
about; everything else (modelprecache, soundprecache, downloadables) is
M5's problem. This subsystem is parallel to flattening — they share no
state.

**5. Instance baselines (TASK-025).** The bridge between subsystems 3 and 4.
Owns the lazy decode of `instancebaseline` entries: when an entity of class
C is first created, look up the baseline blob keyed by C's class ID,
decode it once with C's flattened props, cache the resulting
`PropertyValue[]`, and reuse on every subsequent create of that class.
Trivial in concept, subtle in lifecycle (baseline can arrive before or after
ClassInfo).

**6. Entity system (TASK-026, TASK-027).** Owns `PacketEntities` decoding,
the `EntityList`, and the per-entity property storage chosen in ADR-002.
Reads from subsystems 1, 2, 3, 5; emits `entityCreated`, `entityUpdated`,
`entityDeleted` with entity references. This is the consumer of everything
else — it is also where reality meets theory, where any flattening or
decoder bug surfaces.

## Vertical Slice Ordering

M2 ships in four vertical slices. Each slice ends with a runnable, testable,
end-to-end capability on the de_nuke fixture. No slice ends with "we wrote
half a layer." Slices are ordered by inflection point: each one unlocks the
next, and you can stop at any slice and still have a useful piece of the
parser.

**Slice 1 — Schema is visible.** TASK-013 and TASK-014. End-state: parsing
de_nuke.dem produces `parser.serverClasses` populated with all ~270 CS:GO
classes, each linked to its root SendTable. Acceptance: dump
`(classId, className, dtName)` triples and confirm `CCSPlayer`, `CCSTeam`,
`CCSGameRulesProxy`, `CWeaponAK47` etc. all appear with sensible class IDs.
This slice does not decode a single entity — but it proves the
`dem_datatables` frame parser, the ts-proto integration for
`CSVCMsg_SendTable`/`CSVCMsg_ClassInfo`, and the registry shapes are right.
**No flattening yet.** Tasks within the slice are tightly coupled
(TASK-014 depends on TASK-013) so they serialize.

**Slice 2 — Schema is decoded.** TASK-015, TASK-016, TASK-017, TASK-018.
End-state: each ServerClass has its `flattenedProps: FlattenedSendProp[]`
array populated. Acceptance: for `CCSPlayer`, the array contains the
expected ~250 flattened props in priority-sorted order, with the
`m_vecOrigin[0]/[1]/[2]` props near the front (CHANGES_OFTEN -> priority 64
group) and the rare props at the back. Cross-check counts and key prop
positions against demoinfocs-golang's printed flat-prop dump for the same
demo. **No entity decoding yet.** This is where ADR-001 earns its keep —
the four flattening tasks must execute in spec order (15 -> 16 -> 17 -> 18)
because each builds on the previous.

**Slice 3 — Strings are stored.** TASK-022, TASK-023, TASK-024. End-state:
`stringTableCreated` fires for each of the ~16 tables CS:GO sends, with
correct entry counts. Acceptance: `userinfo` table has up to 64 entries, each
with a player_info_t userdata blob; `instancebaseline` has one entry per
populated ServerClass. **This slice runs in parallel with Slice 2** — they
share zero state. Within the slice, TASK-022 must precede TASK-023 and
TASK-024, but TASK-023 and TASK-024 can be done in either order or
simultaneously by two developers.

**Slice 4 — Entities live.** TASK-019, TASK-020, TASK-021, TASK-025,
TASK-026, TASK-027. This is the big one — six tasks, the actual heart of the
parser. End-state: streaming through de_nuke produces `entityCreated` events
for every player at signon, `entityUpdated` events as players move,
`entityDeleted` events when grenades detonate, with property values
matching demoinfocs-golang on the same demo. Acceptance: at the first
post-freeze tick of round 1, ten CCSPlayer entities exist, each with
`m_vecOrigin` near a known spawn coordinate and `m_iTeamNum` ∈ {2, 3}.
This slice has internal parallelism: TASK-019 (Int), TASK-020 (Float), and
the simpler half of TASK-021 (String) can be done in parallel by three
developers; TASK-021's Array sub-decoder must wait for the Int/Float
decoders to merge. TASK-025 needs all decoders + StringTables (Slice 3) to
be done. TASK-026 needs everything before it. TASK-027 is a small
postscript on TASK-026.

## Parallelism Map

The full parallelism plan, by slice:

- Slice 1: serial (TASK-013, then TASK-014).
- Slice 2: serial within (TASK-015 -> 016 -> 017 -> 018), but **Slice 2 and
  Slice 3 run in parallel** between two developers. This is the biggest
  parallelism win in M2 — the developer doing flattening and the developer
  doing string tables touch disjoint files (`src/datatables/` vs
  `src/stringtables/`) and disjoint protobuf message types.
- Slice 4: TASK-019, TASK-020, TASK-021-strings can all start the moment
  Slice 2 lands (three parallel tracks). TASK-021-arrays serializes after
  Int+Float merge. TASK-025 starts when both Slice 3 and the prop decoders
  land. TASK-026 and TASK-027 are a single track at the very end.

End-to-end, M2 collapses to ~5 critical-path tasks if parallelized well:
TASK-013 -> TASK-015 -> TASK-018 -> TASK-026 -> TASK-027, with everything
else fanning out from those bottlenecks. A team of two developers should
finish M2 in roughly 60% of the wall-clock time of a single-developer
serial schedule.

## Highest-Risk Landmines

Five things are easy to get wrong, hard to detect, and catastrophic if
shipped:

**1. Priority sort instability.** Source's flattening uses a non-standard
sort: it sweeps unique priority levels in ascending order and, for each
level, moves matching props to the front of the remaining unsorted region
while preserving relative order. JavaScript's `Array.prototype.sort` is
stable (ES2019+) but a one-pass `sort((a,b) => a.priority - b.priority)`
gives the wrong order if you don't process priorities in the exact Valve
order including the `CHANGES_OFTEN -> 64` injection. Symptom: entities
decode silently wrong because prop indices in the delta stream don't
match the prop the parser thinks it's at. Prevention: implement the
algorithm exactly as ADR-001 specifies, golden-test the flat prop list
against demoinfocs-golang for `CCSPlayer` before writing any decoder.

**2. Baseline lifecycle race.** The `instancebaseline` string table can
arrive before or after `CSVCMsg_ClassInfo`. If you eagerly decode
baselines on string-table create and ClassInfo hasn't arrived yet, you
have no flattened props to decode against. Symptom: `Cannot decode
baseline for unknown class`, or worse, decoded with wrong schema and
silently wrong. Prevention: store baselines as raw `Uint8Array` blobs and
lazy-decode on first entity-create of that class. ADR explicitly states
this in TASK-025.

**3. Entity index delta off-by-one.** PacketEntities encodes entity
indices as deltas from the previous index, starting from -1. The header is
`(varint delta) (2-bit op)`, and the new index is
`previous + delta + 1`. Forget the +1 and your first entity is index 5
when it should be 6, and every subsequent entity is shifted. Symptom:
players appear to be weapons, weapons appear to be projectiles, the
parser looks like it works but the world is scrambled. Prevention: unit
test the header decoder against a known byte sequence; integration test
entity 0 (the worldspawn) has classId pointing to `CWorld`.

**4. Bit-stream cursor leaks.** Property decoders read variable bit
widths; if any decoder reads one bit too many or too few, every
subsequent prop in the same entity update reads from the wrong offset
and decodes garbage. The "new way" changed-prop-index encoding is
particularly nasty here because it's a recursive bit pattern, not a
fixed shape. Symptom: first few props of an update look right, then
nonsense, then the next entity's header itself is garbage. Prevention:
every property decoder unit test asserts the BitReader cursor advanced
by exactly the expected bit count; integration test reads a full
PacketEntities message and asserts the cursor lands exactly at the
end-of-message bit.

**5. Float quantized rounding mismatch.** Quantized floats use
`SPROP_ROUNDDOWN` and `SPROP_ROUNDUP` flags to bias the high-end value.
The formula is asymmetric — high-precision props with these flags
produce values 0.000001 different from naive linear interpolation, and
those differences appear in player positions with no other visible
symptom. Symptom: golden file tests pass on most ticks and fail on a
handful; positions are "approximately right" but not bit-for-bit
matching the reference parser. Prevention: implement the exact formula
from `dt_common.h::DT_GetHighLowFromBits`, unit test against known
input/output pairs from demoinfocs-golang's float decoder tests.

## Pre-Mortem

Imagine M2 has shipped. We're three months in, M3-M5 are built on top, and
something is wrong. What does the failure look like?

The likeliest catastrophic failure is silent flattening corruption. A subtle
priority-sort bug means CCSPlayer's flat prop list is correct in count but
wrong in order for ~5 props near the boundary between priority groups. We
notice in M5 when the kill feed says player A killed player B with an AK,
but the cross-reference against demoinfocs-golang says it was actually with
a knife — because some entity properties for the active weapon are reading
from the wrong index. This bug is invisible in M2's tests because we tested
prop counts, not byte-for-byte prop ordering. We wish we had committed a
golden flat-prop dump against demoinfocs-golang on day one of Slice 2.

The second-likeliest failure is performance. We chose flat property arrays
for O(1) access (ADR-002), but if the array is sized to maxProps across all
classes (the simpler implementation) we allocate 250 slots per entity for
classes that only have 30 props. With 2048 entity slots, that's 500K mostly-
empty slots in memory. We notice when memory profiling on a long demo shows
us hitting 800MB. We wish we had sized arrays per-class from the start.

A more boring but more probable failure is the `dem_stringtables` snapshot
frame. CS:GO demos sometimes restart string tables mid-demo via a
`dem_stringtables` frame (TASK-058, in M5). If our M2 string-table code
assumes tables are only ever created/updated via the protobuf messages, the
M5 task ends up rewriting half of `StringTableManager`. Prevention: design
`StringTableManager` with a `replaceTable(name, entries)` API even though
TASK-022 only needs `createTable`; the M5 hook becomes a one-liner.

Finally, a Type 1 risk: our entity event payloads (`entityCreated`,
`entityUpdated`, `entityDeleted`) are part of the public API the moment
M2 ships, even if undocumented. If we expose the entity object directly
and the consumer holds a reference past the next tick, they'll see the
properties mutate under them — because we reuse entity slots. We wish we
had decided in M2 whether the event payload is a mutable reference or a
snapshot. ADR-002 punts on this; M3 will need to revisit.

## Definition of Done for M2

M2 is done when, running against `test/fixtures/de_nuke.dem`, the parser:

1. Emits `serverClassesReady` (or equivalent) once with all ~270 CS:GO
   ServerClasses populated, each with a non-empty `flattenedProps` array.
2. Emits `stringTableCreated` for each of the ~16 string tables, with
   `instancebaseline` and `userinfo` populated.
3. Emits `entityCreated` for every player, weapon, and game-rules entity
   present at the first post-signon tick — at least the 10 CCSPlayer
   entities, the CCSTeam entities for CT and T, and the
   CCSGameRulesProxy.
4. For each CCSPlayer at the first post-freeze tick of round 1, the
   entity's flat property array yields `(m_vecOrigin[0], m_vecOrigin[1],
   m_vecOrigin[2])` matching demoinfocs-golang's output for the same demo
   to within the float quantization step (~0.03125 units).
5. Emits `entityUpdated` events as the demo progresses; the
   `m_vecOrigin` properties of player entities change tick-over-tick in a
   way consistent with player movement (no NaN, no zero, no teleporting
   to origin).
6. Emits `entityDeleted` for grenade entities after their detonation
   events.
7. Reaches `dem_stop` without throwing, on de_nuke.dem and on the
   corrupted fixture in `test/fixtures/` if one exists.

These are integration-test acceptance criteria, not unit-test criteria.
Each task in M2 has its own per-task acceptance from `_overview.md`'s DoD;
this list is the milestone-level proof.
