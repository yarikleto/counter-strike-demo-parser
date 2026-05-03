/**
 * `weapon_zoom` Tier-1 enricher (TASK-044, ADR-006).
 *
 * Wire schema: { userid: short }. Fires when a player toggles a scoped
 * weapon's zoom level (AWP, SSG-08, scout). Returns `null` when the player
 * does not resolve.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface WeaponZoomEvent extends EnrichedEvent {
  /** Player toggling zoom on the scoped weapon. */
  readonly player: Player;
}

export const enrichWeaponZoom: Enricher<WeaponZoomEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  return freezeEvent<WeaponZoomEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
  });
};
