/**
 * `announce_phase_end` Tier-1 enricher (TASK-046, ADR-006).
 *
 * Wire schema: empty (verified against de_nuke.dem descriptor table).
 *
 * Fires when the engine announces the end of a half / phase (e.g. the
 * mid-match side-swap in competitive play). The Tier-1 payload exposes only
 * the inherited `eventName` / `eventId` — useful purely as a phase-boundary
 * hook for downstream consumers tracking half/overtime transitions.
 *
 * Returns the enriched event unconditionally — no fields can fail to parse.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";

export type AnnouncePhaseEndEvent = EnrichedEvent;

export const enrichAnnouncePhaseEnd: Enricher<AnnouncePhaseEndEvent> = (raw) => {
  return freezeEvent<AnnouncePhaseEndEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
  });
};
