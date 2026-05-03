/**
 * GameEvent value decoder (TASK-037).
 *
 * Bridges raw `CSVCMsg_GameEvent` proto messages into a self-describing
 * record keyed by the schema's key NAMES (not the proto's positional
 * `keys[]` array). Source's wire convention is positional: index `i` of
 * `msg.keys` corresponds to `descriptor.keys[i]` — the descriptor (built
 * once per demo from `CSVCMsg_GameEventList`, see TASK-036) names every
 * field and declares its wire-level type, and only the value field on the
 * proto's tagged-union `keyT` matching that declared type is populated.
 *
 * Output shape: `{ name, eventId, data }`. `data` is the public Tier-2
 * payload — a frozen `Record<string, string | number | boolean>`. Surfacing
 * the full record (rather than the heterogeneous proto blob) is what makes
 * `parser.on('gameEvent', e => e.data.userid)` legible without consumers
 * needing to know the proto's positional union encoding.
 *
 * uint64 strategy: ts-proto materializes `valUint64` as `bigint`. We
 * preserve precision by coercing to `number` only when the value fits in
 * `Number.MAX_SAFE_INTEGER`; otherwise we surface a decimal string. SteamID64
 * values (used as `xuid` on `player_*` events) almost always exceed safe
 * integer range, so the string path is the common one in practice — but
 * small uint64 fields like `defindex` or `priority` round-trip through
 * `number` cleanly. The `Record` value type stays `string | number |
 * boolean` either way.
 *
 * Length-mismatch policy: if `msg.keys.length !== descriptor.keys.length`
 * we decode the shared prefix and continue. This is a defensive concession
 * for forward-compat servers that may add or omit keys mid-version; we
 * never throw, since the caller (DemoParser) treats decode failures as
 * graceful skips per the brief.
 */
import type { CSVCMsg_GameEvent } from "../proto/index.js";
import type { EventKeyType } from "./EventDescriptor.js";
import type { EventDescriptorTable } from "./EventDescriptorTable.js";

// The `_keyT` cell-shape isn't re-exported by `proto/index.ts` (it's an
// internal nested type of the proto, not a top-level Valve message). Pull
// it directly from the generated module to avoid widening the proto barrel.
import type { CSVCMsgGameEvent_keyT } from "../generated/netmessages.js";

/**
 * Decoded `CSVCMsg_GameEvent` payload — what `parser.on('gameEvent', ...)`
 * receives in TASK-048's Tier-2 catch-all.
 */
export interface DecodedGameEvent {
  /** Event name from the descriptor (e.g. `"player_death"`). */
  readonly name: string;
  /** Numeric event id matching `CSVCMsg_GameEvent.eventid`. */
  readonly eventId: number;
  /** Per-key values, indexed by the descriptor's key names. Frozen. */
  readonly data: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Pull the value out of one wire `keyT` cell, coerced to the descriptor's
 * declared TS-friendly type. Falls back to ts-proto's default-ish empty
 * value for the type when the expected field is absent on the wire — the
 * decoder never throws on under-populated cells.
 */
function decodeKeyValue(
  type: EventKeyType,
  cell: CSVCMsgGameEvent_keyT,
): string | number | boolean {
  switch (type) {
    case "string":
      return cell.valString ?? "";
    case "float":
      return cell.valFloat ?? 0;
    case "long":
      return cell.valLong ?? 0;
    case "short":
      return cell.valShort ?? 0;
    case "byte":
      return cell.valByte ?? 0;
    case "bool":
      return cell.valBool ?? false;
    case "uint64": {
      const big = cell.valUint64;
      if (big === undefined) return "0";
      // Coerce to `number` when safe; surface a decimal string when the
      // value would lose precision in JS's float64 representation. The
      // SteamID64 case (76561197960265728..) is always in the string path.
      if (
        big <= BigInt(Number.MAX_SAFE_INTEGER) &&
        big >= -BigInt(Number.MAX_SAFE_INTEGER)
      ) {
        return Number(big);
      }
      return big.toString();
    }
  }
}

/**
 * Decode a `CSVCMsg_GameEvent` against a descriptor table.
 *
 * Returns `undefined` when the event id is unknown — the caller is expected
 * to surface that as a `gameEventDecodeError` event and continue parsing
 * (per the brief's graceful-degradation requirement).
 */
export function decodeGameEvent(
  msg: CSVCMsg_GameEvent,
  descriptors: EventDescriptorTable,
): DecodedGameEvent | undefined {
  const eventId = msg.eventid ?? 0;
  const descriptor = descriptors.getById(eventId);
  if (descriptor === undefined) {
    return undefined;
  }

  const wireKeys: readonly CSVCMsgGameEvent_keyT[] = msg.keys ?? [];
  const schemaKeys = descriptor.keys;
  // Decode the shared prefix on length mismatch; never throw. Source rarely
  // mismatches in practice but a single forward-compat server build could.
  const n = Math.min(wireKeys.length, schemaKeys.length);

  const data: Record<string, string | number | boolean> = {};
  for (let i = 0; i < n; i++) {
    const schemaKey = schemaKeys[i];
    const wireKey = wireKeys[i];
    if (schemaKey === undefined || wireKey === undefined) continue;
    data[schemaKey.name] = decodeKeyValue(schemaKey.type, wireKey);
  }

  return {
    name: descriptor.name,
    eventId,
    data: Object.freeze(data),
  };
}
