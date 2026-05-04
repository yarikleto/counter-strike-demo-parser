/**
 * `item_pickup` Tier-1 enricher (TASK-043, ADR-006).
 *
 * Wire schema (verified against de_nuke.dem in `item-events.test.ts`):
 *   { userid: short, item: string, silent: bool, defindex: long }
 *
 * Resolution: `userid` -> `Player` via `ctx.resolvePlayer`. When the player
 * does not resolve (disconnect-mid-tick or `userid === 0`) this enricher
 * returns `null` per the TASK-043 brief — diverging from ADR-006 decision 5
 * for the item-event family because a pickup without a picker-up has no
 * actionable shape for any downstream consumer (no inventory attribution).
 *
 * `item` defaults to the empty string when absent on the wire — the
 * descriptor always carries the string key but a forward-compat server
 * build could omit it; emit-anyway with the conservative default is
 * friendlier than dropping the event. Sibling fields `silent` and
 * `defindex` are not surfaced on the Tier-1 payload — the TASK-043 brief
 * locks the public shape to `{ player, item }` and additional fields are
 * left to a future ticket if a consumer needs them. Tier-2 listeners can
 * still observe them via the raw `gameEvent` catch-all.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface ItemPickupEvent extends EnrichedEvent {
  /** Player picking up the item. */
  readonly player: Player;
  /** Item class name (e.g. `weapon_ak47`, `knife`). Empty string if absent on wire. */
  readonly item: string;
}

export const enrichItemPickup: Enricher<ItemPickupEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const item = typeof raw.data.item === "string" ? raw.data.item : "";

  return freezeEvent<ItemPickupEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    item,
  });
};
