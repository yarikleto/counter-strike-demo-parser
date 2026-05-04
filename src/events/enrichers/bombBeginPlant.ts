/**
 * `bomb_beginplant` Tier-1 enricher (TASK-039, ADR-006).
 *
 * Fires when the planter's plant key-press initiates the 3.2s plant
 * animation (CS:GO competitive). Pairs with `bomb_planted` (success) or
 * `bomb_abortplant` (interrupted by movement / death / weapon swap) —
 * analysts time plant-attempt windows by diffing begin/end events.
 *
 * Wire schema: { userid: short, site: long }
 *
 * Returns `null` when the planter doesn't resolve.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface BombBeginPlantEvent extends EnrichedEvent {
  /** Player who started the plant animation. */
  readonly player: Player;
  /** Level-design entity index of the bomb-target brush (map-specific). */
  readonly site: number;
}

export const enrichBombBeginPlant: Enricher<BombBeginPlantEvent> = (
  raw,
  ctx,
) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const site = typeof raw.data.site === "number" ? raw.data.site : 0;

  return freezeEvent<BombBeginPlantEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    site,
  });
};
