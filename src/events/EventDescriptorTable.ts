/**
 * EventDescriptorTable — id/name index over the parsed `CSVCMsg_GameEventList`
 * descriptors (TASK-036).
 *
 * The table is built once per demo, when the server's GameEventList arrives
 * during signon. From that point on it is read-mostly: the GameEvent decoder
 * (TASK-037) calls `getById(eventId)` for every `CSVCMsg_GameEvent` message
 * (potentially thousands per demo), and user code calls `getByName(name)` to
 * look up the schema for a known event by its string identifier.
 *
 * Both lookups are O(1): we keep two parallel maps. The name->id index is
 * rebuilt on `add()` to keep the two maps consistent if a descriptor is ever
 * re-added under the same id with a different name (defensive — Source does
 * not actually do this on the wire, but the alternative would be a stale
 * name pointing at a recycled id slot).
 */
import type { CSVCMsg_GameEventList } from "../proto/index.js";
import type { EventDescriptor } from "./EventDescriptor.js";
import { eventKeyTypeFromWire } from "./EventDescriptor.js";

export class EventDescriptorTable {
  private readonly byId = new Map<number, EventDescriptor>();
  private readonly byName = new Map<string, number>();

  /**
   * Insert a descriptor. If the same `eventId` was added previously the
   * older descriptor is replaced and its old name->id entry (if any) is
   * removed so `getByName` of the stale name returns `undefined`.
   */
  add(descriptor: EventDescriptor): void {
    const previous = this.byId.get(descriptor.eventId);
    if (previous !== undefined && previous.name !== descriptor.name) {
      // Drop the stale name->id entry — but only if it still points at us;
      // if it has since been remapped to a different id, leave it alone.
      const mappedId = this.byName.get(previous.name);
      if (mappedId === descriptor.eventId) {
        this.byName.delete(previous.name);
      }
    }
    this.byId.set(descriptor.eventId, descriptor);
    this.byName.set(descriptor.name, descriptor.eventId);
  }

  /** Look up a descriptor by its numeric event id. */
  getById(eventId: number): EventDescriptor | undefined {
    return this.byId.get(eventId);
  }

  /** Look up a descriptor by its string event name (e.g. `"player_death"`). */
  getByName(name: string): EventDescriptor | undefined {
    const id = this.byName.get(name);
    if (id === undefined) return undefined;
    return this.byId.get(id);
  }

  /** Number of distinct event descriptors currently in the table. */
  get size(): number {
    return this.byId.size;
  }

  /** Iterate every descriptor in id-insertion order. */
  *[Symbol.iterator](): IterableIterator<EventDescriptor> {
    for (const desc of this.byId.values()) {
      yield desc;
    }
  }
}

/**
 * Build an {@link EventDescriptorTable} from a decoded `CSVCMsg_GameEventList`
 * proto message.
 *
 * Each raw descriptor becomes an {@link EventDescriptor}; each raw key's
 * numeric type code is normalised to its TS label via
 * {@link eventKeyTypeFromWire}. Keys whose type code is unknown (outside the
 * documented 1..7 range) are dropped from the descriptor's key list — the
 * descriptor itself still surfaces with the keys we *can* type, which keeps
 * the table useful even on a forward-compat server that ships a brand-new
 * type code we don't yet understand.
 */
export function buildDescriptorTable(
  msg: CSVCMsg_GameEventList,
): EventDescriptorTable {
  const table = new EventDescriptorTable();
  for (const raw of msg.descriptors ?? []) {
    const eventId = raw.eventid ?? 0;
    const name = raw.name ?? "";
    const keys = (raw.keys ?? [])
      .map((k) => {
        const type = eventKeyTypeFromWire(k.type ?? 0);
        if (type === undefined) return undefined;
        return { name: k.name ?? "", type } as const;
      })
      .filter((k): k is { readonly name: string; readonly type: NonNullable<ReturnType<typeof eventKeyTypeFromWire>> } =>
        k !== undefined,
      );
    table.add({ eventId, name, keys });
  }
  return table;
}
