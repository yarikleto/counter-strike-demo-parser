/**
 * PrecacheTable — read-only convenience accessor for a Source precache
 * string table.
 *
 * Source's networking layer ships three precache string tables that map a
 * compact integer index (sent on the wire as part of an entity prop or a
 * sound/download packet) to a human-readable file path:
 *
 *   - `modelprecache`   — `models/...` paths referenced by `m_nModelIndex`
 *                         on every entity that carries a model. The integer
 *                         the entity networks IS the entry index into this
 *                         table; resolving it gives the .mdl file path.
 *   - `soundprecache`   — `sound/...` paths referenced by sound events.
 *   - `downloadables`   — arbitrary files the server requested clients
 *                         download (custom maps, sprays, mod content, ...).
 *
 * Wire-level details (CreateStringTable / UpdateStringTable / Snappy
 * compression / history-coded entry deltas) are already handled by the
 * core parser. This wrapper is the application-facing projection: each
 * entry's `key` IS the file path, and the wire index IS the lookup index.
 *
 * Liveness: the wrapper holds the `StringTableManager` by reference, not
 * a snapshot of the entries. Tables added or extended after the wrapper
 * is constructed are visible on subsequent reads — no need to
 * re-instantiate per tick. Pre-snapshot reads (before the underlying table
 * exists) are safe and return `undefined` / `0` / `[]`.
 *
 * Indexing: matches the wire convention. `get(0)` is the first entry; the
 * table is populated densely from index 0 by Source, so iterating
 * `0 .. size - 1` visits every entry in order. `all()` returns a frozen
 * snapshot of those entries projected to their file-path strings.
 */
import type { StringTableManager } from "./StringTableManager.js";

export class PrecacheTable {
  private readonly manager: StringTableManager | undefined;
  private readonly tableName: string;

  /**
   * Construct a wrapper bound to the given manager and table name. The
   * `manager` argument may be `undefined` — callers can hand the parser's
   * `stringTables` getter through directly without a null-check, and every
   * lookup degrades cleanly to "not yet populated" until the manager and
   * named table both exist.
   */
  constructor(manager: StringTableManager | undefined, tableName: string) {
    this.manager = manager;
    this.tableName = tableName;
  }

  /**
   * Resolve a precache index to its file path, or `undefined` if the
   * manager / table / entry is missing.
   *
   * Negative or non-finite indices return `undefined` (matching
   * `StringTable.getByIndex`'s range check). The returned string is the
   * raw `key` stored on the wire — typically a forward-slash path like
   * `"models/player/ct_fbi.mdl"` for `modelprecache`.
   */
  get(index: number): string | undefined {
    const table = this.manager?.getByName(this.tableName);
    if (table === undefined) return undefined;
    return table.getByIndex(index)?.key;
  }

  /**
   * Snapshot all populated entries as a frozen array of file paths,
   * indexed identically to `get(i)` (i.e. position N of the array is the
   * entry at wire index N). Returns an empty frozen array if the manager
   * or table is missing.
   *
   * The array is a one-shot snapshot — subsequent additions to the
   * underlying table are NOT reflected. Call `all()` again, or use
   * `get(i)` for live reads.
   *
   * Note: `StringTable` storage is sparse by spec; in practice the three
   * precache tables are densely populated from index 0 during signon, so
   * holes are unlikely. Any hole surfaces as an empty string at that
   * position to keep the index alignment intact.
   */
  all(): readonly string[] {
    const table = this.manager?.getByName(this.tableName);
    if (table === undefined) return Object.freeze([]);
    const out: string[] = [];
    // Walk the dense range [0, size) — `entries()` skips holes and would
    // collapse the index alignment. We resolve each slot via getByIndex
    // so a hole becomes an empty string, preserving `out[i] === get(i)`.
    const max = table.size;
    let resolved = 0;
    let i = 0;
    while (resolved < max) {
      const entry = table.getByIndex(i);
      if (entry !== undefined) {
        out[i] = entry.key;
        resolved += 1;
      } else {
        out[i] = "";
      }
      i += 1;
      // Safety bound: if `size` somehow disagrees with the underlying
      // sparse layout (e.g. `maxEntries` was tiny and we've walked past
      // it), bail rather than spin forever.
      if (i > table.maxEntries) break;
    }
    return Object.freeze(out);
  }

  /**
   * Number of entries currently registered. `0` until the underlying
   * table is created; grows as the parser observes `CreateStringTable` /
   * `UpdateStringTable` messages. Matches `StringTable.size` semantics —
   * counts populated entries only, skipping any sparse holes.
   */
  get size(): number {
    return this.manager?.getByName(this.tableName)?.size ?? 0;
  }
}
