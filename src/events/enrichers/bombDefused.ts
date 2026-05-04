/**
 * `bomb_defused` Tier-1 enricher (TASK-039, ADR-006).
 *
 * Wire schema: { userid: short, site: long }
 *
 * Mirrors {@link enrichBombPlanted}'s shape: defuser as `Player`, site as
 * the level-design entity index of the target brush. Returns `null` when
 * the defuser can't be resolved — a defuse without a defuser is not
 * actionable.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface BombDefusedEvent extends EnrichedEvent {
  /** Player who defused the bomb. */
  readonly player: Player;
  /** Level-design entity index of the bomb-target brush (map-specific). */
  readonly site: number;
}

export const enrichBombDefused: Enricher<BombDefusedEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const site = typeof raw.data.site === "number" ? raw.data.site : 0;

  return freezeEvent<BombDefusedEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    site,
  });
};
