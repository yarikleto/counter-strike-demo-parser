/**
 * `bomb_dropped` Tier-1 enricher (TASK-039, ADR-006).
 *
 * Wire schema: { userid: short, entindex: long }
 *
 * The wire key is `entindex` (Source's spelling); the Tier-1 surface
 * promotes it to camelCase `entityIndex` per ADR-005's overlay rules
 * (and ADR-006 decision 6 — strip Hungarian, camelCase the rest).
 * `entityIndex` is the entity id of the dropped C4 weapon entity, useful
 * for correlating the drop with subsequent pickup / position lookups via
 * `parser.entities`.
 *
 * Returns `null` when the dropper userid doesn't resolve.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface BombDroppedEvent extends EnrichedEvent {
  /** Player who dropped the bomb. */
  readonly player: Player;
  /** Entity index of the dropped C4 weapon entity. */
  readonly entityIndex: number;
}

export const enrichBombDropped: Enricher<BombDroppedEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const entityIndex =
    typeof raw.data.entindex === "number" ? raw.data.entindex : 0;

  return freezeEvent<BombDroppedEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    entityIndex,
  });
};
