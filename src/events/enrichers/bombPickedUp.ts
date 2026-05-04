/**
 * `bomb_pickup` Tier-1 enricher (TASK-039, ADR-006).
 *
 * Wire key is `bomb_pickup` (Source's spelling — verified against the
 * descriptor table on de_nuke.dem). The Tier-1 type and function follow
 * the past-tense `BombPickedUpEvent` / `enrichBombPickedUp` naming so the
 * public surface reads naturally; the enricher registers under the wire
 * key, NOT the function name (consistent with `playerSpawned` mapping to
 * `player_spawn`).
 *
 * Wire schema: { userid: short }
 *
 * Returns `null` when the userid doesn't resolve — a pickup without a
 * picker has no actionable shape.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface BombPickedUpEvent extends EnrichedEvent {
  /** Player who picked the bomb up. */
  readonly player: Player;
}

export const enrichBombPickedUp: Enricher<BombPickedUpEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  return freezeEvent<BombPickedUpEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
  });
};
