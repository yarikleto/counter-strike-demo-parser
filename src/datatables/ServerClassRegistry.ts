/**
 * ServerClassRegistry — id-keyed and name-keyed store of every ServerClass
 * decoded from the trailing CSVCMsg_ClassInfo of a dem_datatables frame.
 *
 * The entity system identifies networked classes by class ID (densely
 * packed integers starting at 0), so the primary index is by classId.
 * Lookups by C++ class name (`CCSPlayer`, `CWeaponAK47`, ...) are common
 * enough at debug/test time to warrant a secondary index — Source ships
 * ~270 classes, so the cost is negligible.
 *
 * Like SendTableRegistry, the registry is build-once read-many. Built
 * during signon, then immutable for the rest of parsing.
 */
import type { ServerClass } from "./ServerClass.js";

export class ServerClassRegistry {
  private readonly byClassId = new Map<number, ServerClass>();
  private readonly byClassName = new Map<string, ServerClass>();

  /**
   * Register a ServerClass. Throws on duplicate classId or duplicate
   * className — both indicate a bug or a malformed demo.
   */
  register(serverClass: ServerClass): void {
    if (this.byClassId.has(serverClass.classId)) {
      throw new Error(
        `ServerClassRegistry: duplicate classId ${serverClass.classId}`,
      );
    }
    if (this.byClassName.has(serverClass.className)) {
      throw new Error(
        `ServerClassRegistry: duplicate className "${serverClass.className}"`,
      );
    }
    this.byClassId.set(serverClass.classId, serverClass);
    this.byClassName.set(serverClass.className, serverClass);
  }

  /** Look up a ServerClass by its dense class ID. */
  byId(id: number): ServerClass | undefined {
    return this.byClassId.get(id);
  }

  /** Look up a ServerClass by its C++ class name (e.g. `CCSPlayer`). */
  byName(name: string): ServerClass | undefined {
    return this.byClassName.get(name);
  }

  /** Number of registered ServerClasses. */
  get size(): number {
    return this.byClassId.size;
  }

  /**
   * All registered ServerClasses in registration (= wire) order.
   *
   * Returns a new array snapshot; callers can mutate it safely.
   */
  all(): ServerClass[] {
    return Array.from(this.byClassId.values());
  }
}
