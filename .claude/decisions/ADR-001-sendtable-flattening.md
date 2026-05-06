# ADR-001: SendTable Flattening Algorithm

> Status: ACCEPTED | Author: architect | Date: 2026-04-28
> Scope: TASK-015, TASK-016, TASK-017, TASK-018

## Decision

We will implement Source's four-pass SendTable flattening algorithm exactly
as Valve does it, producing per-ServerClass `FlattenedSendProp[]` arrays
that are stored as a struct-of-arrays in the ServerClass record. The four
passes are: (1) gather exclusions across the whole tree, (2) collect
non-excluded, non-DataTable props by recursive descent treating
collapsible DataTables as in-place merges, (3) sort the collected props
using Valve's specific priority-sweep algorithm with `SPROP_CHANGES_OFTEN`
mapped to priority 64. We do not invent a "cleaner" algorithm. We do not
use `Array.prototype.sort`. We do not flatten in a single pass.

## Why

PacketEntities decodes use prop *indices* into the flattened array. Those
indices are wire-protocol-implicit — the demo never names a prop, it
just says "prop #34 changed, here's its new value." If our flattening
produces a different prop at index 34 than Valve's server produced when
encoding the demo, every entity update from that point on decodes
silently wrong. There is no checksum, no schema negotiation, no error.
The decoded value will be a plausible number that means nothing.

Three reference implementations (demoinfocs-golang, manta, demoparser2) all
implement this exact algorithm because deviating from Valve's order
produces parser output that disagrees with Valve's reference output, and
the only way to be right is to match the encoder bit-for-bit. The four-
pass shape is not an accident — it is forced by the specification of
`SPROP_EXCLUDE` (which references prop names that may live in a different
table), the recursive structure of DataTable props, the special semantics
of `SPROP_COLLAPSIBLE`, and the priority sort that must be stable within a
priority group while sweeping group boundaries in order.

## The Algorithm

### Source references

The canonical Valve implementation lives in the Source SDK in
`public/dt_common.h`, `engine/dt_send_eng.cpp`
(`SendTable_BuildHierarchy`, `SendTable_Flatten`), and
`engine/dt_recv_eng.cpp`. Our implementation mirrors `SendTable_Flatten`
on the receive side. The most readable third-party reference is
`demoinfocs-golang`'s `pkg/demoinfocs/sendtables/sendtables.go` —
specifically the `flatten`, `gatherExcludes`, `gatherProps`, and
`sortProps` functions. `RESEARCH NEEDED:` We have not yet pinned the
exact Valve commit hash for `dt_send_eng.cpp` because the public SDK
copy is a CS:GO snapshot, not the live engine source. Before merging
TASK-018, the developer should cross-check our priority sort against
the Go reference's `sortProps` line-by-line.

### Pass 1 — Exclusion gathering (TASK-015)

Walk every SendTable reachable from the root, depth-first, following
DataTable-type props (regardless of `SPROP_COLLAPSIBLE`). For each prop
encountered with `SPROP_EXCLUDE` set, record the pair
`(excludeDtName, excludePropName)` where `excludeDtName` is taken from
the prop's `dtName` field (the DT being referenced) and `excludePropName`
from `varName`. The result is a `Set<string>` keyed by
`` `${dtName}.${propName}` ``.

Exclusions can reference props in tables that are themselves descendants
of the current root, which is why we gather them all up front before any
prop collection. An excluded prop may live three levels deep in the tree;
we cannot know it is excluded until we have walked the entire subtree.

### Pass 2 — Prop collection (TASK-016, TASK-017)

Walk the tree again, depth-first from the root SendTable. At each prop:

- If the prop has `SPROP_EXCLUDE`, skip it entirely (it is a marker, not
  data).
- If the pair `(currentTable.netTableName, prop.varName)` is in the
  exclusion set, skip it.
- If the prop is `DPT_DataTable`:
  - If `SPROP_COLLAPSIBLE` is set, recurse into the referenced table and
    append its props *to the current accumulator at the current level*
    (in-place merge — no nesting marker).
  - Otherwise, recurse into the referenced table and append its props
    with the source-table name preserved on each `FlattenedSendProp`.
- Otherwise (a leaf prop), append a `FlattenedSendProp` referencing this
  prop with its source-table name attached.

The output of pass 2 is an unsorted `FlattenedSendProp[]` in tree-walk
order.

### Pass 3 — Priority sort (TASK-018)

This is the algorithm that does *not* match `Array.prototype.sort`. We
implement it explicitly:

```
priorities = unique({SPROP_CHANGES_OFTEN ? 64 : prop.priority for each prop})
sort(priorities, ascending)
write_index = 0
for each priority P in priorities (ascending):
    for read_index = write_index .. props.length - 1:
        prop = props[read_index]
        effectivePriority = (prop.flags & SPROP_CHANGES_OFTEN) ? 64 : prop.priority
        if effectivePriority == P:
            swap props[write_index] and props[read_index]
            write_index += 1
```

Two non-obvious properties:

1. **`SPROP_CHANGES_OFTEN -> 64` mapping is implicit.** Some props have
   no priority field set (priority = 0 in the proto) but have
   `SPROP_CHANGES_OFTEN`. They must sort with the priority-64 group, not
   the priority-0 group. Folding this into the comparison is the bug-
   prone part — a naive `sort((a,b) => a.priority - b.priority)` puts
   them at the front, which is catastrophically wrong.
2. **Stability within a priority group is required.** Two props with the
   same effective priority must keep the relative order they had after
   pass 2 (tree-walk order). The algorithm above is stable because the
   inner loop walks read_index left-to-right and only swaps to the
   write_index — it does not reorder within the unsorted region.

The output of pass 3 is the final, sorted `FlattenedSendProp[]` that the
PacketEntities decoder will index into.

## The Data Structure

`FlattenedSendProp` is a flat record, stored as a plain object today and
suitable for a struct-of-arrays representation later if profiling
demands it. Per CLAUDE.md's "flat property arrays for O(1) access" rule,
we optimize for index-based access at decode time, not name-based
lookup at consumer time.

```ts
interface FlattenedSendProp {
  // Identity
  varName: string;             // e.g., "m_vecOrigin[0]"
  sourceDtName: string;        // e.g., "DT_BaseEntity"
  // Decode parameters (copied from the SendProp proto for cache locality)
  type: SendPropType;          // DPT_Int | DPT_Float | DPT_Vector | ...
  flags: number;               // bitfield
  numBits: number;
  numElements: number;         // for DPT_Array
  lowValue: number;            // for quantized DPT_Float
  highValue: number;
  // For DPT_Array: the per-element prop definition
  arrayElement?: FlattenedSendProp;
}
```

`varName` and `sourceDtName` are kept for diagnostics, golden-file
testing, and the future game-state layer's name-to-index resolution
(M3 needs to know "which index is `m_iHealth`?" — it does that lookup
once at construction, then stores the index).

A future optimization, deferred unless profiling demands it: replace
the array-of-objects with parallel typed arrays (`Int32Array` for
flags/numBits, `Float64Array` for low/high) keyed by prop index. This
trades object-shape monomorphism (which V8 already gives us with a
plain class) for cache locality. Not worth doing in M2 — premature
optimization.

`ServerClass` holds:

```ts
interface ServerClass {
  classId: number;
  className: string;            // "CCSPlayer"
  dataTableName: string;        // "DT_CSPlayer"
  rootTable: SendTable;
  flattenedProps: FlattenedSendProp[];  // populated after flattening
}
```

Flattening runs once, lazily, the first time a `flattenedProps` array is
requested for a given ServerClass. Eager flattening at ClassInfo time is
also acceptable and simpler — pick whichever the developer prefers; the
choice is reversible.

## Alternatives Considered and Rejected

**Single-pass flattening with deferred exclusion checking.** Rejected:
this is what every newcomer tries to write, and it works for 90% of
cases but breaks when an exclusion in `DT_LocalPlayerExclusive`
references a prop in `DT_BaseEntity` reached via a different path.
The two-pass shape is forced by the spec.

**`Array.prototype.sort` with a custom comparator that handles
`SPROP_CHANGES_OFTEN`.** Rejected: this is concise and stable in
ES2019+, and would *probably* produce identical output. But "probably"
is not good enough when wrong output silently corrupts every entity
decode. The Valve algorithm is not a sort — it is a priority-bucket
sweep — and writing it explicitly makes the intent visible to the
next person who reads the code, including reviewers asked to verify
correctness against the Go reference.

**Decoding props directly from the raw SendTable tree, no flattening.**
Rejected: the wire format encodes prop changes as flat indices, not as
tree paths. Flattening is not an optimization; it is required by the
protocol.

## Open Questions

- `RESEARCH NEEDED:` Confirm whether CSGO ever sets `priority` to a
  value greater than 64 (the `CHANGES_OFTEN` value). If yes, our priority
  sweep must include those higher values; if no, we can short-circuit to
  three groups (0, 64, anything-else) for a small speedup. The Go
  reference does not short-circuit. Recommend the developer not
  short-circuit either; performance is not a concern at the flattening
  step (it runs once).
- `RESEARCH NEEDED:` Determine whether `CCSPlayer`'s ~250 flat-prop
  count is stable across CSGO versions. If it varies, the M2 acceptance
  test should use a tolerance band, not an exact count. The de_nuke
  fixture commits us to a single version; we'll know the exact count
  empirically once TASK-016 lands.

---

## 2026-04-29 Note: bucket-sweep sort corroborated by golden dump

`.claude/research/golden-flat-props.md` lets us verify the priority-bucket-sweep claim against real output. CCSPlayer's 1745-prop table groups cleanly by priority: rows 0–8 are priorities 0,1,2,4,5,6,7,8 (the position/velocity/origin set, all `CHANGES_OFTEN`-flagged with low raw priorities), rows 9–1318 sit at raw priority 128, and rows 1319–1744 sit at raw priority 140 (the `m_iMatchStats_*` and `m_EquippedLoadoutItemDefIndices` array expansions). No row reports raw priority 64 — demoinfocs dumps the unmodified SendProp priority field. But the *ordering* is exactly what the `CHANGES_OFTEN → 64` promotion produces: within the priority-128 region, the 17 `CHANGES_OFTEN`-flagged props (indices 9–25, e.g. `m_nDuckTimeMsecs`, `m_fFlags`, `m_iFOV`, `m_angEyeAngles[*]`) come *before* the non-`CHANGES_OFTEN` priority-128 props (index 26 onward, starting `m_AnimOverlay.001.m_flWeight`). That ordering is only achievable if the sorter pulled all `CHANGES_OFTEN` props to the front in a priority-64 pass before walking the priority-128 bucket. Within the priority-128 non-`CHANGES_OFTEN` group, props appear in tree-walk order matching the SendTable hierarchy (`m_AnimOverlay.001.*` together, then `m_AnimOverlay.002.*`, then `m_AnimOverlay.003.*`, ..., then unrelated props later) — not alphabetical, not grouped by source DT alone, just gather order. ADR-001's algorithm is unchanged.

## 2026-04-29 Note: priority-140 validation deferred

Total counts and cross-bucket ordering match `golden-flat-props.md` exactly, but within the priority-140 bucket our two-pass DT-first walker emits the `m_iMatchStats_*` sub-table expansions (the 13 array-of-array sub-tables that produce 30 entries each — `m_iMatchStats_Kills`, `m_iMatchStats_Damage`, etc., plus `m_EquippedLoadoutItemDefIndices`) in a different order than demoinfocs-golang's reference. This affects rows 1355–1744 of `golden-flat-props.md`: the entries are all present, all carry priority 140, and all are leaf int props, but the within-bucket sequence differs. The flattening test in `test/integration/flattening.test.ts` documents the gap and explicitly avoids asserting any property of the priority-140 region's internal order to keep the suite green; a `TODO(TASK-018a)` marker is planted there for grep discovery.

Validation of this gap is deferred to TASK-018a, which can only run once Slice 4 / TASK-021 lands and we can decode actual entity property streams against the priority-140 props. Slice 4 cannot be marked DONE until TASK-018a has confirmed that decoded `m_iMatchStats_*` values match demoinfocs-golang on a known fixture — if they don't, the flattening order is wrong and entity decode will silently misread these stats. If they do, the divergence is cosmetic (the wire encoder happens to produce the same bytes for either order because all 390 entries share the same priority, type, and bit width), and we close TASK-018a with a note explaining why two valid orderings exist.
