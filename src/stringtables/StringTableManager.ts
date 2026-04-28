/**
 * StringTableManager — registry of every StringTable created during parsing.
 *
 * Tables are keyed by both `name` (the server-assigned string) and `id` (the
 * order in which CreateStringTable messages were received, starting at 0).
 * The wire protocol references tables by ID in CSVCMsg_UpdateStringTable, so
 * the dispatcher needs the id-keyed lookup; the application-level API uses
 * names. Both indices are O(1).
 *
 * `replaceTable` is reserved for M5's `dem_stringtables` snapshot frame
 * (TASK-058) — it lets the snapshot frame wipe and reseed an existing table
 * without reassigning IDs. TASK-022 only needs `register`.
 */
import type { StringTable } from "./StringTable.js";

export class StringTableManager {
  private readonly byName = new Map<string, StringTable>();
  private readonly byId: StringTable[] = [];

  /**
   * Register a newly-created StringTable. Its id is the count of tables
   * registered so far — i.e., insertion order.
   */
  register(table: StringTable): number {
    if (this.byName.has(table.name)) {
      throw new Error(
        `StringTableManager: duplicate table name "${table.name}"`,
      );
    }
    const id = this.byId.length;
    this.byId.push(table);
    this.byName.set(table.name, table);
    return id;
  }

  /**
   * Replace an existing table's storage with a freshly-constructed one,
   * preserving its id slot. Used by `dem_stringtables` snapshot frames in
   * M5 (TASK-058) which wipe and reseed mid-demo. Throws if the named
   * table doesn't exist.
   */
  replaceTable(table: StringTable): void {
    const existing = this.byName.get(table.name);
    if (existing === undefined) {
      throw new Error(
        `StringTableManager: cannot replace unknown table "${table.name}"`,
      );
    }
    const id = this.byId.indexOf(existing);
    if (id < 0) {
      // Should be impossible — byName and byId are kept in sync by register.
      throw new Error(
        `StringTableManager: table "${table.name}" missing from id index`,
      );
    }
    this.byId[id] = table;
    this.byName.set(table.name, table);
  }

  /** Look up a table by its server-assigned name. */
  getByName(name: string): StringTable | undefined {
    return this.byName.get(name);
  }

  /** Look up a table by its wire id (assignment order, starting at 0). */
  getById(id: number): StringTable | undefined {
    if (id < 0 || id >= this.byId.length) return undefined;
    return this.byId[id];
  }

  /** All registered tables in id order. */
  all(): StringTable[] {
    return this.byId.slice();
  }

  /** Number of registered tables. */
  get size(): number {
    return this.byId.length;
  }
}
