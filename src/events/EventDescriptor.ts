/**
 * Game-event descriptor types (TASK-036).
 *
 * CSVCMsg_GameEventList carries an array of *descriptors*, one per game event
 * type the server can fire. Each descriptor names the event (`player_death`,
 * `round_start`, …) and lists the keys carried by every instance of that
 * event, with the wire-level type of each key. The descriptor table built
 * from this message is the schema that the GameEvent decoder (TASK-037) uses
 * to interpret each `CSVCMsg_GameEvent` payload — without it, the values
 * arrive as a tagged-union blob with no key names attached.
 *
 * The numeric type codes come from Source's `IGameEventManager2`:
 *
 *   1 = string  (UTF-8 null-terminated, exposed as TS `string`)
 *   2 = float   (32-bit IEEE-754, exposed as TS `number`)
 *   3 = long    (signed 32-bit, exposed as TS `number`)
 *   4 = short   (signed 16-bit, exposed as TS `number`)
 *   5 = byte    (unsigned 8-bit, exposed as TS `number`)
 *   6 = bool    (1 byte, exposed as TS `boolean`)
 *   7 = uint64  (unsigned 64-bit, exposed as TS `bigint`)
 *
 * We surface them as a string union rather than the raw int enum so that
 * downstream consumers (the GameEvent decoder, the Tier-2 catch-all event in
 * TASK-048) can switch on a self-documenting label and TypeScript can
 * exhaustively check the switch.
 */

/** Wire-level value type of a single game-event key. */
export type EventKeyType =
  | "string"
  | "float"
  | "long"
  | "short"
  | "byte"
  | "bool"
  | "uint64";

/** One named key inside an {@link EventDescriptor}. */
export interface EventKeyDescriptor {
  /** Field name as networked by the server, e.g. `"userid"`, `"weapon"`. */
  readonly name: string;
  /** TypeScript-friendly label for the wire type (see {@link EventKeyType}). */
  readonly type: EventKeyType;
}

/**
 * Schema for one game-event type.
 *
 * Built once when CSVCMsg_GameEventList arrives (early in the signon
 * sequence) and consulted thereafter by the GameEvent decoder to interpret
 * each `CSVCMsg_GameEvent` payload's tagged-union values.
 */
export interface EventDescriptor {
  /** Numeric event id used on the wire (matches `CSVCMsg_GameEvent.eventid`). */
  readonly eventId: number;
  /** Human-readable event name, e.g. `"player_death"`. */
  readonly name: string;
  /** Ordered key schema; matches the order in which values are networked. */
  readonly keys: readonly EventKeyDescriptor[];
}

/**
 * Map a numeric Source event-key type code to its TS-friendly label.
 *
 * Returns `undefined` when the code is outside the documented 1..7 range —
 * callers should treat this as a "skip / log" condition rather than abort the
 * parse, since forward-compat servers could in principle ship a new code.
 */
export function eventKeyTypeFromWire(code: number): EventKeyType | undefined {
  switch (code) {
    case 1:
      return "string";
    case 2:
      return "float";
    case 3:
      return "long";
    case 4:
      return "short";
    case 5:
      return "byte";
    case 6:
      return "bool";
    case 7:
      return "uint64";
    default:
      return undefined;
  }
}
