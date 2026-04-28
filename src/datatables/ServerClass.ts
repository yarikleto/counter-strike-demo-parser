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
import type { SendProp, SendTable } from "./SendTable.js";

/**
 * A flattened SendProp — one entry of a ServerClass's decode template.
 *
 * The flattening pass (M2 Slice 2) walks each ServerClass's root SendTable
 * tree and emits one `FlattenedSendProp` per non-excluded leaf prop. The
 * resulting array, indexed by wire prop index, drives the PacketEntities
 * decoder.
 *
 * We carry the original `SendProp` by reference rather than copy its
 * fields — this keeps the structure small (one pointer + one string per
 * entry) and means downstream code uses the same `SendProp` interface
 * already validated by the Slice 1 decoder. `sourceTableName` is retained
 * for diagnostics, golden-file tests, and future name->index resolution.
 */
export interface FlattenedSendProp {
  /** The original SendProp definition (type, name, flags, bit count, range, etc). */
  readonly prop: SendProp;
  /** Name of the SendTable this prop was defined in — used for excludes and debugging. */
  readonly sourceTableName: string;
  /**
   * Element template for ARRAY-typed props. Set only when `prop.type ===
   * SendPropType.ARRAY` — otherwise undefined.
   *
   * Source's wire layout for arrays carries the per-element shape as a
   * separate SendProp marked with `SPROP_INSIDEARRAY` immediately
   * preceding the array prop in the parent table's prop list. The
   * flattener pulls that template into the array's `arrayElement` so
   * later property decoders can route element decoding without a separate
   * lookup. We carry it as a full `FlattenedSendProp` (rather than a bare
   * `SendProp`) so the array's element decoder can recursively call
   * `decodeProp` with the same shape it accepts at the top level.
   */
  readonly arrayElement?: FlattenedSendProp;
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
