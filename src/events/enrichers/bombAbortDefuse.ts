/**
 * `bomb_abortdefuse` Tier-1 enricher (TASK-039, ADR-006).
 *
 * Fires when an in-progress defuse is interrupted (the defuser moved
 * off the bomb, took damage that broke defuse, or died). Pairs with
 * `bomb_begindefuse` — analysts treat a begin-without-completion as a
 * failed defuse attempt and weigh the time-window for site retake
 * pressure.
 *
 * Wire schema: { userid: short }
 *
 * Returns `null` when the defuser doesn't resolve.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface BombAbortDefuseEvent extends EnrichedEvent {
  /** Player who aborted the defuse. */
  readonly player: Player;
}

export const enrichBombAbortDefuse: Enricher<BombAbortDefuseEvent> = (
  raw,
  ctx,
) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  return freezeEvent<BombAbortDefuseEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
  });
};
