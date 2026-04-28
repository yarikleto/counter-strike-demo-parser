/**
 * Instance baseline lazy decode (TASK-025).
 *
 * The `instancebaseline` string table holds, per ServerClass, a binary
 * blob containing the default-value byte stream for an entity of that
 * class. The entry KEY is the decimal class ID as a string (e.g. "40"),
 * NOT the C++ class name. The userdata is a raw bit stream encoded with
 * the same shape as a PacketEntities prop-update delta: a changed-prop-
 * index list followed by per-prop decoded values.
 *
 * This module decodes the blob lazily — on first need — using the
 * ServerClass's flattened-prop list as the decode template. The decoded
 * `(propIndex, value)` pairs are cached on the ServerClass and reused on
 * every subsequent enter-PVS of that class.
 *
 * Lifecycle gotcha (the architect's M2 pre-mortem #2): the instancebaseline
 * string table can arrive BEFORE or AFTER ClassInfo. If the table entry
 * isn't present yet, we return `undefined` and the entity decoder falls
 * back to a slot with no baseline applied — the first PacketEntities
 * delta will populate the props. We retry the baseline decode on the next
 * enter-PVS for the same class.
 *
 * Reference: `markus-wa/demoinfocs-golang/pkg/demoinfocs/datatables.go::handleStringTable`,
 * `pkg/demoinfocs/sendtables/entity.go::initialize` (where baseline is
 * applied to a fresh entity).
 */
import { BitReader } from "../reader/BitReader.js";
import type { ServerClass } from "../datatables/ServerClass.js";
import type { StringTableManager } from "../stringtables/StringTableManager.js";
import type { PropertyValue } from "../properties/Property.js";
import { decodeProp } from "../properties/decodeProp.js";
import { readChangedPropIndices } from "./ChangedPropIndices.js";

export interface InstanceBaseline {
  /** Sorted ascending list of flatPropIndices the baseline specifies. */
  readonly propIndices: number[];
  /** Parallel array of decoded values, one per propIndex. */
  readonly values: PropertyValue[];
}

/**
 * Get the instance baseline for `serverClass`, decoding it lazily on first
 * call and caching the result on the class. Returns `undefined` if the
 * `instancebaseline` string table entry for this class isn't present yet
 * (race condition handled by retry on next enter-PVS).
 *
 * Caching semantics: a successful decode is cached forever (`null` cache
 * sentinel records "decode attempted, no entry present" so we re-attempt
 * each time — the table can be back-filled by an UpdateStringTable later).
 */
export function getOrDecodeBaseline(
  serverClass: ServerClass,
  stringTables: StringTableManager,
): InstanceBaseline | undefined {
  if (serverClass.cachedBaseline !== undefined && serverClass.cachedBaseline !== null) {
    return serverClass.cachedBaseline;
  }
  const decoded = decodeBaseline(serverClass, stringTables);
  if (decoded === undefined) {
    // Mark "tried, missing" so callers don't repeatedly re-do the lookup
    // within a single decode pass — but allow retry by reading the cache
    // as `null` not `undefined` and re-decoding next call. We choose to
    // ALWAYS retry for simplicity: the lookup is one map hit and one
    // string conversion, dominated by the wider entity decode path.
    serverClass.cachedBaseline = null;
    return undefined;
  }
  serverClass.cachedBaseline = decoded;
  return decoded;
}

/**
 * Apply a baseline's writes to an EntityStore slot. Pure function — does
 * not consult the `cachedBaseline` field; callers pass the baseline in.
 */
export function applyBaseline(
  baseline: InstanceBaseline,
  applyWrite: (propIdx: number, value: PropertyValue) => void,
): void {
  for (let i = 0; i < baseline.propIndices.length; i++) {
    applyWrite(baseline.propIndices[i]!, baseline.values[i]!);
  }
}

function decodeBaseline(
  serverClass: ServerClass,
  stringTables: StringTableManager,
): InstanceBaseline | undefined {
  const table = stringTables.getByName("instancebaseline");
  if (table === undefined) return undefined;
  // Entry key is the decimal classId as a string.
  const entry = table.getByName(String(serverClass.classId));
  if (entry === undefined || entry.userData === undefined) return undefined;
  const userData = entry.userData;
  if (userData.length === 0) return undefined;

  const reader = new BitReader(userData);
  const propIndices = readChangedPropIndices(
    reader,
    serverClass.flattenedProps.length,
  );
  const values: PropertyValue[] = [];
  for (const idx of propIndices) {
    values.push(decodeProp(reader, serverClass.flattenedProps[idx]!));
  }
  return { propIndices, values };
}
