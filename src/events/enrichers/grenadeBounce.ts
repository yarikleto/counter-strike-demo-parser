/**
 * `grenade_bounce` Tier-1 enricher (TASK-041, ADR-006).
 *
 * Wire schema: { userid: short }
 *
 * Fires every time a grenade projectile collides with a brush or prop and
 * reflects. The grenade tracker (TASK-063) consumes this together with
 * `grenade_thrown` to reconstruct grenade trajectories; without the
 * thrower the bounce is unattributable, so we return `null` on
 * unresolved userid (matches `grenade_thrown`).
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface GrenadeBounceEvent extends EnrichedEvent {
  /** Player who threw the grenade that bounced. */
  readonly thrower: Player;
}

export const enrichGrenadeBounce: Enricher<GrenadeBounceEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const thrower =
    typeof userid === "number" && userid !== 0
      ? ctx.resolvePlayer(userid)
      : undefined;
  if (thrower === undefined) return null;

  return freezeEvent<GrenadeBounceEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    thrower,
  });
};
