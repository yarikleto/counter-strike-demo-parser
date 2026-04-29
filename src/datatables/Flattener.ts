/**
 * SendTable flattener — passes 2, 3, and 4 of the four-pass algorithm
 * specified in ADR-001.
 *
 * Pass 2 (TASK-016): walk the SendTable tree depth-first from the root,
 * collecting every non-excluded leaf prop. DATATABLE-typed props recurse
 * inline — their child props splice in at the recursion site, in tree-walk
 * order. The output is an unsorted `FlattenedSendProp[]`.
 *
 * Pass 3 (TASK-017): refines the DATATABLE handling for `SPROP_COLLAPSIBLE`.
 * Per ADR-001 and Source's `SendTable_Flatten`, both collapsible and non-
 * collapsible DATATABLE props produce identical flat output — every
 * descendant leaf is appended to the parent's accumulator regardless of
 * the COLLAPSIBLE flag. The flag matters at higher layers (proxy
 * dispatch, baseline-class detection in the live engine), not here. We
 * document this equivalence with a unit test that toggles the flag and
 * asserts identical output.
 *
 * Pass 4 (TASK-018): the priority-bucket sweep, NOT a comparator sort.
 * - For each prop, compute an effective priority:
 *     `(flags & CHANGES_OFTEN) ? 64 : prop.priority`
 * - Build the unique sorted ascending set of effective priorities, with
 *   64 always included (so CHANGES_OFTEN props sweep at the right point
 *   even when no prop has literal priority 64).
 * - For each priority P in ascending order, walk the unsorted region of
 *   the array left-to-right and swap matching props to the write head.
 *   This is stable within a priority bucket because we never reorder the
 *   tail.
 *
 * Why not `Array.prototype.sort`: ES2019+ sort is stable, but the
 * CHANGES_OFTEN -> 64 mapping changes the comparator boundary. The Source
 * algorithm is a bucket sweep, not a sort, and we replicate it
 * faithfully — see the architect's M2 pre-mortem on priority sort
 * instability for why this matters.
 */
import type { FlattenedSendProp } from "./ServerClass.js";
import { SendPropType, type SendTable } from "./SendTable.js";
import type { SendTableRegistry } from "./SendTableRegistry.js";
import { SPropFlags } from "./SPropFlags.js";
import { exclusionKey } from "./Exclusions.js";

/**
 * Walk the SendTable tree from `rootTable` and return the unsorted
 * tree-walk-order list of leaf props, with EXCLUDE'd entries skipped.
 *
 * Both collapsible and non-collapsible DATATABLE props recurse the same
 * way: their children are appended inline to the parent's accumulator.
 * See the TASK-017 module comment above for the rationale.
 */
export function flattenSendTable(
  rootTable: SendTable,
  registry: SendTableRegistry,
  exclusions: Set<string>,
): FlattenedSendProp[] {
  const out: FlattenedSendProp[] = [];
  const visited = new Set<string>();
  walk(rootTable, registry, exclusions, out, visited);
  return out;
}

function walk(
  table: SendTable,
  registry: SendTableRegistry,
  exclusions: Set<string>,
  out: FlattenedSendProp[],
  visited: Set<string>,
): void {
  // Top-level entry: drive the demoinfocs-golang `gatherProps` algorithm
  // (pkg/demoinfocs/sendtables/st_parser.go). The key insight is that the
  // GLOBAL output list is built incrementally as we encounter
  // non-COLLAPSIBLE sub-tables — each non-COLLAPSIBLE recursion FLUSHES
  // its descendants to `out` before the parent finishes its iteration.
  // Then the parent's own leaves + COLLAPSIBLE descendants are flushed
  // LAST as a single tmp block.
  //
  // Distinction from Source:
  //   - **COLLAPSIBLE DT** (SPROP_COLLAPSIBLE) → recurse into the SAME
  //     `tmp` list as the parent.
  //   - **Non-COLLAPSIBLE DT** → eagerly flush its content to the global
  //     `out` BEFORE returning to the parent.
  //
  // Net ordering rule: at every level, all non-COLLAPSIBLE sub-table
  // descendants come BEFORE the parent's own leaves and COLLAPSIBLE
  // descendants in the final output. This matches Source's wire ordering
  // (verified against golden flat-prop dump at
  // `.claude/research/golden-flat-props.md`).
  gatherProps(table, registry, exclusions, out, visited);
}

/**
 * Equivalent of demoinfocs's `gatherProps`: gather the table's own leaves
 * + COLLAPSIBLE descendants into a tmp list. Non-COLLAPSIBLE descendants
 * are flushed to `out` (the GLOBAL accumulator) eagerly during iteration.
 * After iteration, append the tmp list to `out`.
 */
function gatherProps(
  table: SendTable,
  registry: SendTableRegistry,
  exclusions: Set<string>,
  out: FlattenedSendProp[],
  visited: Set<string>,
): void {
  const tmp: FlattenedSendProp[] = [];
  iterateProps(table, registry, exclusions, out, tmp, visited);
  for (const fp of tmp) out.push(fp);
}

/**
 * Equivalent of demoinfocs's `gatherPropsIterate`: walks props in
 * declaration order. COLLAPSIBLE DTs recurse with the SAME `tmp`;
 * non-COLLAPSIBLE DTs recurse via `gatherProps` which flushes its
 * content to `out` immediately.
 */
function iterateProps(
  table: SendTable,
  registry: SendTableRegistry,
  exclusions: Set<string>,
  out: FlattenedSendProp[],
  tmp: FlattenedSendProp[],
  visited: Set<string>,
): void {
  if (visited.has(table.netTableName)) return;
  visited.add(table.netTableName);

  // INSIDEARRAY props describe the element shape of the IMMEDIATELY-
  // following ARRAY prop. We track the most recent one and attach it to
  // the next ARRAY we emit.
  let pendingArrayElement: FlattenedSendProp | undefined;

  for (const prop of table.props) {
    if ((prop.flags & SPropFlags.EXCLUDE) !== 0) continue;
    if ((prop.flags & SPropFlags.INSIDEARRAY) !== 0) {
      pendingArrayElement = { prop, sourceTableName: table.netTableName };
      continue;
    }
    if (exclusions.has(exclusionKey(table.netTableName, prop.varName))) continue;

    if (prop.type === SendPropType.DATATABLE) {
      if (prop.dtName === undefined) continue;
      const sub = registry.get(prop.dtName);
      if (sub === undefined) continue;
      // Cloning the visited set per-recursion keeps cycle protection
      // intact while permitting diamond paths (A -> B and A -> C -> B).
      if ((prop.flags & SPropFlags.COLLAPSIBLE) !== 0) {
        // Inline into parent's tmp.
        iterateProps(sub, registry, exclusions, out, tmp, new Set(visited));
      } else {
        // Eagerly flush this sub-tree to the global `out`.
        gatherProps(sub, registry, exclusions, out, new Set(visited));
      }
      continue;
    }

    if (prop.type === SendPropType.ARRAY) {
      tmp.push({
        prop,
        sourceTableName: table.netTableName,
        arrayElement: pendingArrayElement,
      });
      pendingArrayElement = undefined;
      continue;
    }

    tmp.push({ prop, sourceTableName: table.netTableName });
  }
}

/**
 * Compute a prop's effective priority for the bucket-sweep sort.
 *
 * Per Source's `SendTable_Sort`, a CHANGES_OFTEN-flagged prop is capped
 * at priority 64 if its declared priority is higher (so a CO prop with
 * raw priority 128 sorts in bucket 64) but **keeps its declared priority
 * if it is already below 64** (so a CO prop with raw priority 0 stays in
 * bucket 0). Verified against demoinfocs-golang's reference dump for
 * CCSPlayer: idx 0 is `m_flSimulationTime` (raw priority 0, CO) which
 * sorts at bucket 0, while idx 9-25 are CO props with raw priority 128
 * which sort at bucket 64. The rule: `CO ? min(priority, 64) : priority`.
 *
 * Earlier drafts of this file (and an earlier reading of ADR-001) had a
 * fixed `CO ? 64 : priority` rule. The dump's idx-0 anchor falsifies
 * that: a fixed-64 rule pulls `m_flSimulationTime` after `m_nTickBase`
 * (raw priority 1), but the wire actually puts simtime first. The
 * `min(priority, 64)` rule preserves the raw priority for low-priority
 * CO props and caps high-priority CO props.
 */
function effectivePriority(prop: FlattenedSendProp["prop"]): number {
  if ((prop.flags & SPropFlags.CHANGES_OFTEN) !== 0) {
    return Math.min(prop.priority, 64);
  }
  return prop.priority;
}

/**
 * Stable bucket-sweep priority sort. Returns a NEW array; does not mutate
 * the input.
 *
 * Algorithm (verbatim from ADR-001):
 *   priorities = unique({ effectivePriority(p) for each p }) ∪ {64}
 *   sort(priorities, ascending)
 *   write_index = 0
 *   for each priority P in priorities:
 *     for read_index = write_index .. props.length - 1:
 *       if effectivePriority(props[read_index]) === P:
 *         swap(props, write_index, read_index)
 *         write_index += 1
 *
 * The "always include 64" rule guarantees CHANGES_OFTEN props get their
 * own pass even when no prop literally declares priority 64, which is the
 * common case in CS:GO (the de_nuke fixture has 0 props with raw
 * priority 64).
 */
export function prioritySort(
  flattenedProps: readonly FlattenedSendProp[],
): FlattenedSendProp[] {
  const props = flattenedProps.slice(); // mutable copy

  // Build the unique priority bucket list. Use a Set for dedup, then sort.
  const prioritySet = new Set<number>();
  prioritySet.add(64); // CHANGES_OFTEN bucket always exists
  for (const fp of props) {
    prioritySet.add(effectivePriority(fp.prop));
  }
  const priorities = Array.from(prioritySet).sort((a, b) => a - b);

  let writeIndex = 0;
  for (const p of priorities) {
    for (let readIndex = writeIndex; readIndex < props.length; readIndex++) {
      if (effectivePriority(props[readIndex]!.prop) === p) {
        // Swap to the write head. The forward read order means props at
        // a given priority retain their relative tree-walk order — the
        // stability the spec requires.
        if (readIndex !== writeIndex) {
          const tmp = props[writeIndex]!;
          props[writeIndex] = props[readIndex]!;
          props[readIndex] = tmp;
        }
        writeIndex++;
      }
    }
  }

  return props;
}
