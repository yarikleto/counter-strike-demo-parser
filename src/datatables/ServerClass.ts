/**
 * ServerClass — one row from CSVCMsg_ClassInfo, linked to its root SendTable.
 *
 * A ServerClass is the runtime type identifier the entity system uses: every
 * networked entity has a class ID, and the class ID resolves to one
 * ServerClass which knows the entity's C++ class name (`CCSPlayer`), its
 * data-table name (`DT_CSPlayer`), and — once flattening runs in Slice 2 —
 * the flattened decode template applied to delta-encoded entity updates.
 *
 * The `flattenedProps` field is reserved for Slice 2; it is populated AFTER
 * the SendTable graph has been flattened. We declare it here (defaulting to
 * an empty array) so adding flattening doesn't change the type signature
 * and break consumers built on Slice 1.
 */
import type { SendTable } from "./SendTable.js";

/**
 * A flattened SendProp — populated by M2 Slice 2's flattening pass.
 *
 * Slice 1 leaves this as a placeholder marker so the `flattenedProps`
 * field on ServerClass has a stable type signature now and Slice 2 only
 * has to populate it. The full shape (with decode metadata) lands with
 * TASK-015.
 */
export interface FlattenedSendProp {
  /** TODO: populated in TASK-015 / TASK-018 — Slice 2 of M2. */
  readonly _placeholder?: never;
}

/**
 * A networked C++ class registered with the server.
 *
 * Mutable on purpose: `flattenedProps` is filled in after construction by
 * the Slice 2 flattening pass. All other fields are immutable post-
 * construction.
 */
export interface ServerClass {
  /** Server-assigned class ID; densely packed starting from 0. */
  readonly classId: number;
  /** C++ class name, e.g. `CCSPlayer`. */
  readonly className: string;
  /** Root SendTable name for this class, e.g. `DT_CSPlayer`. */
  readonly dtName: string;
  /** Resolved root SendTable; undefined only if the demo references a missing table. */
  readonly sendTable: SendTable | undefined;
  /**
   * Flattened decode template — empty until M2 Slice 2 populates it.
   * See {@link FlattenedSendProp} for the placeholder shape.
   */
  flattenedProps: FlattenedSendProp[];
}
