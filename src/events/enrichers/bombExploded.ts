/**
 * `bomb_exploded` Tier-1 enricher (TASK-039, ADR-006).
 *
 * Wire schema: { userid: short, site: long }
 *
 * Per TASK-039's brief the Tier-1 surface drops the planter `userid` —
 * by the time the bomb explodes the planter may be dead or disconnected
 * and the field is rarely actionable (consumers correlate via the prior
 * `bombPlanted` event). Site stays.
 *
 * Never returns `null`: the explosion is a deterministic level event —
 * even with a missing site value (defensive default 0), there's still an
 * event to surface. Mirrors the no-player-resolution branch the brief
 * calls out explicitly.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";

export interface BombExplodedEvent extends EnrichedEvent {
  /** Level-design entity index of the bomb-target brush (map-specific). */
  readonly site: number;
}

export const enrichBombExploded: Enricher<BombExplodedEvent> = (raw) => {
  const site = typeof raw.data.site === "number" ? raw.data.site : 0;

  return freezeEvent<BombExplodedEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    site,
  });
};
