/**
 * `bomb_begindefuse` Tier-1 enricher (TASK-039, ADR-006).
 *
 * Fires when the defuser's defuse key-press initiates the defuse
 * animation. `hasKit` (wire field `haskit`) is the high-leverage signal:
 * defuse-with-kit is 5s, defuse-without-kit is 10s — analysts gate "is
 * this defuse possible?" calculations on this single bool.
 *
 * Wire schema: { userid: short, haskit: bool }
 *
 * Field naming: `haskit` -> `hasKit` per ADR-005 / ADR-006 decision 6
 * (strip Hungarian, camelCase).
 *
 * Returns `null` when the defuser doesn't resolve.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface BombBeginDefuseEvent extends EnrichedEvent {
  /** Player who started the defuse. */
  readonly player: Player;
  /**
   * True if the defuser has a defuse kit (5s defuse), false otherwise
   * (10s defuse). Source's wire field is `haskit`.
   */
  readonly hasKit: boolean;
}

export const enrichBombBeginDefuse: Enricher<BombBeginDefuseEvent> = (
  raw,
  ctx,
) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const hasKit = raw.data.haskit === true;

  return freezeEvent<BombBeginDefuseEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    hasKit,
  });
};
