/**
 * `bomb_abortplant` Tier-1 enricher (TASK-039, ADR-006).
 *
 * Fires when an in-progress plant is interrupted (the planter moved off
 * the trigger, swapped weapon, or died). Pairs with `bomb_beginplant` —
 * the matching ABORT confirms the plant attempt did NOT complete. A
 * begin-without-abort-and-without-planted typically means the planter
 * died mid-plant; analysts treat the period between begin and abort/end
 * as a contestable window.
 *
 * Wire schema: { userid: short, site: long }
 *
 * Returns `null` when the planter doesn't resolve.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface BombAbortPlantEvent extends EnrichedEvent {
  /** Player who aborted the plant. */
  readonly player: Player;
  /** Level-design entity index of the bomb-target brush (map-specific). */
  readonly site: number;
}

export const enrichBombAbortPlant: Enricher<BombAbortPlantEvent> = (
  raw,
  ctx,
) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const site = typeof raw.data.site === "number" ? raw.data.site : 0;

  return freezeEvent<BombAbortPlantEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    site,
  });
};
