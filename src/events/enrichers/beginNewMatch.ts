/**
 * `begin_new_match` Tier-1 enricher (TASK-046, ADR-006).
 *
 * Wire schema: empty (verified against de_nuke.dem descriptor table).
 *
 * Fires when a new competitive/casual match enters its setup phase — useful
 * as a "match boundary" hook for downstream consumers that want to reset
 * per-match accumulators independently of warmup detection. The Tier-1
 * payload exposes only the inherited `eventName` / `eventId`.
 *
 * Returns the enriched event unconditionally — no fields can fail to parse.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";

export type BeginNewMatchEvent = EnrichedEvent;

export const enrichBeginNewMatch: Enricher<BeginNewMatchEvent> = (raw) => {
  return freezeEvent<BeginNewMatchEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
  });
};
