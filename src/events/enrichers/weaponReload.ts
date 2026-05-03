/**
 * `weapon_reload` Tier-1 enricher (TASK-044, ADR-006).
 *
 * Wire schema: { userid: short }. Resolves the userid to a `Player` and
 * emits the typed payload. Returns `null` when the player does not resolve
 * — a reload without a reloading player has no consumer-meaningful shape.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface WeaponReloadEvent extends EnrichedEvent {
  /** Player performing the reload. */
  readonly player: Player;
}

export const enrichWeaponReload: Enricher<WeaponReloadEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  return freezeEvent<WeaponReloadEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
  });
};
