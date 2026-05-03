/**
 * `other_death` Tier-1 enricher (TASK-038, ADR-006).
 *
 * Wire schema:
 *   { otherid: long, othertype: string, attacker: short, weapon: string }
 *
 * Fires when a non-player entity dies — chickens on de_inferno being the
 * canonical example. Useful for novelty stats and for detecting bait/troll
 * gunshots that give away position. Always emits when invoked: there is no
 * required `Player` field (`attacker` may be world). The descriptor's
 * `otherid` is the killed entity's id, which we surface as a raw number
 * since the dead entity is by definition not in the live entity list any
 * more after the event fires.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface OtherDeathEvent extends EnrichedEvent {
  /** Killer — `undefined` for world / engine kills. */
  readonly attacker: Player | undefined;
  /** Class name of the killed entity (e.g. `"chicken"`). */
  readonly entityType: string;
  /** Weapon class name or `"world"` for world kills. */
  readonly weapon: string;
}

export const enrichOtherDeath: Enricher<OtherDeathEvent> = (raw, ctx) => {
  const attackerId = raw.data.attacker;
  const attacker =
    typeof attackerId === "number" && attackerId !== 0
      ? ctx.resolvePlayer(attackerId)
      : undefined;

  const entityType =
    typeof raw.data.othertype === "string" ? raw.data.othertype : "";
  const weapon = typeof raw.data.weapon === "string" ? raw.data.weapon : "";

  return freezeEvent<OtherDeathEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    attacker,
    entityType,
    weapon,
  });
};
