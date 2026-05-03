/**
 * `round_prestart` Tier-1 enricher (TASK-040, ADR-006).
 *
 * Wire schema: empty. Fires immediately before the engine resets per-round
 * state for a new round — useful as a hook for round-scoped accumulator
 * resets in downstream consumers. The Tier-1 payload exposes only the
 * inherited `eventName` / `eventId` plus `roundNumber` from
 * `gameRules.totalRoundsPlayed`.
 *
 * Returns the enriched event unconditionally.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";

export interface RoundPrestartEvent extends EnrichedEvent {
  /**
   * Round number sourced from `gameRules.totalRoundsPlayed`. Defaults to
   * `0` when `gameRules` is unavailable.
   */
  readonly roundNumber: number;
}

export const enrichRoundPrestart: Enricher<RoundPrestartEvent> = (raw, ctx) => {
  const roundNumber = ctx.gameRules?.totalRoundsPlayed ?? 0;

  return freezeEvent<RoundPrestartEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    roundNumber,
  });
};
