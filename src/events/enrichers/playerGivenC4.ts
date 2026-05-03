/**
 * `player_given_c4` Tier-1 enricher (TASK-038, ADR-006).
 *
 * Wire schema: { userid: short }
 *
 * Fires at round start when the engine assigns the bomb to one player on the
 * T side. High-leverage for analysis: the C4 carrier is a known target of
 * focus and their position drives early-round T strategy.
 *
 * Returns `null` when the userid doesn't resolve to a `Player` — a "given
 * C4" event without a recipient has no actionable shape.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface PlayerGivenC4Event extends EnrichedEvent {
  /** The T-side player the C4 was assigned to. */
  readonly player: Player;
}

export const enrichPlayerGivenC4: Enricher<PlayerGivenC4Event> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  return freezeEvent<PlayerGivenC4Event>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
  });
};
