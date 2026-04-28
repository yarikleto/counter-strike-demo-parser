/**
 * Exclusion gathering — pass 1 of the four-pass SendTable flattening
 * algorithm specified in ADR-001.
 *
 * Walks every SendTable reachable from a root, depth-first, and collects
 * the `(dtName, varName)` pairs of every prop with `SPROP_EXCLUDE` set.
 * The result is a Set of `"${dtName}::${varName}"` keys consumed by the
 * prop-collection pass (TASK-016).
 *
 * Why this is a separate pass: an exclusion may be declared in a sub-tree
 * yet reference a prop in a different sub-tree (or even one already
 * walked). We have no way to know whether `(DT_X, m_iFoo)` is excluded
 * until we have visited every node in the tree. Doing it inline with prop
 * collection produces correct output 90% of the time and silently wrong
 * output the rest — exactly the kind of bug the architect's M2 pre-mortem
 * called out.
 *
 * Shape of an EXCLUDE prop on the wire (per Source's `dt_common.h` and
 * confirmed against the ts-proto decoded SendProp):
 *   - flags has SPROP_EXCLUDE bit set
 *   - dtName  field carries the name of the table whose prop is excluded
 *   - varName field carries the name of the prop within that table
 * The prop's own `type` (typically DPT_DataTable) is NOT a sub-table
 * reference here — it is purely a marker. We do NOT recurse into the
 * `dtName` of an EXCLUDE prop.
 */
import type { SendTable } from "./SendTable.js";
import type { SendTableRegistry } from "./SendTableRegistry.js";
import { SPropFlags } from "./SPropFlags.js";

/** Key format for the exclusion set: `${dtName}::${varName}`. */
export function exclusionKey(dtName: string, varName: string): string {
  return `${dtName}::${varName}`;
}

/**
 * Walk the SendTable hierarchy starting at `rootTable` and collect every
 * `SPROP_EXCLUDE`-flagged prop into a Set of exclusion keys.
 *
 * Recursion follows DATATABLE-typed props by looking up their `dtName` in
 * the registry. A `visited` set prevents infinite loops in the rare case
 * a malformed demo declares a cyclic table reference.
 */
export function gatherExclusions(
  rootTable: SendTable,
  registry: SendTableRegistry,
): Set<string> {
  const exclusions = new Set<string>();
  const visited = new Set<string>();
  walk(rootTable, registry, exclusions, visited);
  return exclusions;
}

function walk(
  table: SendTable,
  registry: SendTableRegistry,
  exclusions: Set<string>,
  visited: Set<string>,
): void {
  if (visited.has(table.netTableName)) return;
  visited.add(table.netTableName);

  for (const prop of table.props) {
    if ((prop.flags & SPropFlags.EXCLUDE) !== 0) {
      // EXCLUDE props are markers, not data. dtName names the table whose
      // prop is excluded; varName names the prop within that table.
      if (prop.dtName !== undefined) {
        exclusions.add(exclusionKey(prop.dtName, prop.varName));
      }
      continue;
    }
    // Recurse into DATATABLE props (DPT_DataTable === 6). Skipping arrays:
    // their dtName is the element-prop name, not a table.
    if (prop.type === 6 /* SendPropType.DATATABLE */ && prop.dtName !== undefined) {
      const sub = registry.get(prop.dtName);
      if (sub !== undefined) {
        walk(sub, registry, exclusions, visited);
      }
    }
  }
}
