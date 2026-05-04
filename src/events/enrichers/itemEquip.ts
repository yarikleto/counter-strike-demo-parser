/**
 * `item_equip` Tier-1 enricher (TASK-043, ADR-006).
 *
 * Wire schema (verified against de_nuke.dem in `item-events.test.ts`):
 *   { userid: short, item: string, defindex: long, canzoom: bool,
 *     hassilencer: bool, issilenced: bool, hastracers: bool,
 *     weptype: short, ispainted: bool }
 *
 * Resolution: `userid` -> `Player` via `ctx.resolvePlayer`. When the
 * player does not resolve, the enricher returns `null` — an equip
 * without an equipper has no actionable shape for any downstream consumer.
 *
 * `item` defaults to the empty string when absent on the wire. The
 * remaining wire fields (`defindex`, `canzoom`, `hassilencer`, etc.) are
 * not surfaced on the Tier-1 payload — the TASK-043 brief locks the
 * public shape to `{ player, item }`. Consumers needing the silencer
 * state or weapon type can subscribe to the Tier-2 `gameEvent` catch-all.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface ItemEquipEvent extends EnrichedEvent {
  /** Player equipping the item. */
  readonly player: Player;
  /** Item class name (e.g. `weapon_ak47`, `knife`). Empty string if absent on wire. */
  readonly item: string;
}

export const enrichItemEquip: Enricher<ItemEquipEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const item = typeof raw.data.item === "string" ? raw.data.item : "";

  return freezeEvent<ItemEquipEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    item,
  });
};
