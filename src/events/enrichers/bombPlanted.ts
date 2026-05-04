/**
 * `bomb_planted` Tier-1 enricher (TASK-039, ADR-006).
 *
 * Wire schema (CS:GO event descriptor on de_nuke.dem):
 *   { userid: short, site: long }
 *
 * `userid` -> `player`. Returns `null` if the planter doesn't resolve — a
 * plant without a planter has no actionable shape (consistent with the
 * Wave 1 `playerSpawned` / `playerGivenC4` contract).
 *
 * `site` is a level-design entity index (the `func_bomb_target` brush's
 * entity id), NOT a small A/B byte. On de_nuke the observed value was 174;
 * other maps surface different ints. Per TASK-039 the field is `number` —
 * consumers map site indices to A/B via map-specific tables out of band.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface BombPlantedEvent extends EnrichedEvent {
  /** Player who planted the bomb. */
  readonly player: Player;
  /** Level-design entity index of the bomb-target brush (map-specific). */
  readonly site: number;
}

export const enrichBombPlanted: Enricher<BombPlantedEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const site = typeof raw.data.site === "number" ? raw.data.site : 0;

  return freezeEvent<BombPlantedEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    site,
  });
};
