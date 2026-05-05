/**
 * SendTableRegistry — name-keyed store of every SendTable parsed from a
 * dem_datatables frame.
 *
 * The flattening pass (M2 Slice 2) and the entity decoder (Slice 4) both
 * resolve SendTable references by `netTableName`, so a Map keyed by name is
 * the natural shape. Insertion order is the wire order of svc_SendTable
 * messages, which is preserved by Map iteration — useful when debugging.
 *
 * Mutability: the registry is built once during signon and then read-only
 * for the rest of parsing. We don't expose a `clear()` or `delete()` because
 * tearing down a SendTable mid-parse would corrupt every entity referencing
 * it.
 */
import type { SendTable } from "./SendTable.js";

/**
 * Build-once / read-many name-keyed store of every `SendTable` parsed from
 * the demo's `dem_datatables` frame. After `parseDataTables` populates it
 * the registry is effectively immutable — entity decode and the flattening
 * pass treat it as a frozen schema.
 */
export class SendTableRegistry {
  private readonly tables = new Map<string, SendTable>();

  /**
   * Register a SendTable. If a table with the same `netTableName` is already
   * present, throws — duplicate registrations indicate a bug in the parser
   * or a malformed demo.
   */
  register(table: SendTable): void {
    if (this.tables.has(table.netTableName)) {
      throw new Error(
        `SendTableRegistry: duplicate SendTable for "${table.netTableName}"`,
      );
    }
    this.tables.set(table.netTableName, table);
  }

  /** Look up a SendTable by its `netTableName`. Returns undefined if absent. */
  get(name: string): SendTable | undefined {
    return this.tables.get(name);
  }

  /** True if a SendTable with this name has been registered. */
  has(name: string): boolean {
    return this.tables.has(name);
  }

  /** Number of registered SendTables. */
  get size(): number {
    return this.tables.size;
  }

  /**
   * All registered SendTables in registration (= wire) order.
   *
   * Returns a new array snapshot; callers can mutate the returned array
   * without affecting the registry.
   */
  all(): SendTable[] {
    return Array.from(this.tables.values());
  }
}
