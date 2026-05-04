/**
 * `item_purchase` Tier-1 enricher (TASK-043, ADR-006).
 *
 * Wire schema (verified against de_nuke.dem in `item-events.test.ts`):
 *   { userid: short, team: short, loadout: short, weapon: string }
 *
 * IMPORTANT — wire field naming inconsistency: the CS:GO descriptor for
 * `item_purchase` keys the purchased class name as `weapon`, NOT `item`,
 * even though sibling events `item_pickup` and `item_equip` both use
 * `item`. CS:GO descriptor key names are descriptor-table-keyed strings
 * and the engine is not consistent across events. The TASK-043 public
 * contract is to surface the class name under the field `item: string`
 * uniformly across all three Tier-1 item events, so this enricher reads
 * `raw.data.weapon` and surfaces it as `item` on the typed payload.
 *
 * Resolution: `userid` -> `Player` via `ctx.resolvePlayer`. When the
 * player does not resolve, the enricher returns `null` (a purchase
 * without a buyer has no actionable shape for any downstream consumer).
 *
 * Probe note: `item_purchase` fires zero times on the de_nuke.dem fixture
 * because the bots in that demo run with auto-equipped loadouts and never
 * hit the buy menu. The integration test floors at zero accordingly. The
 * unit tests pin the field-mapping behaviour with hand-built payloads so
 * the behaviour is verified even when the fixture exercises no instance.
 *
 * `team` and `loadout` from the wire are not surfaced on the Tier-1
 * payload — the TASK-043 brief locks the public shape to `{ player, item }`.
 * Tier-2 listeners can still observe them via the raw `gameEvent` catch-all.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface ItemPurchaseEvent extends EnrichedEvent {
  /** Player purchasing the item. */
  readonly player: Player;
  /** Item class name (e.g. `weapon_ak47`). Empty string if absent on wire. */
  readonly item: string;
}

export const enrichItemPurchase: Enricher<ItemPurchaseEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  // Wire field is `weapon`, not `item` — see header comment.
  const item = typeof raw.data.weapon === "string" ? raw.data.weapon : "";

  return freezeEvent<ItemPurchaseEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    item,
  });
};
