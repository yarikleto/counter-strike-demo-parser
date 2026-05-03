/**
 * `round_poststart` Tier-1 enricher (TASK-040, ADR-006).
 *
 * Wire schema: empty. Fires after the engine has finished setting up a new
 * round (entities respawned, equipment refilled, freeze timer started).
 * The Tier-1 payload exposes only the inherited `eventName` / `eventId`
 * plus `roundNumber` from `gameRules.totalRoundsPlayed`.
 *
 * Returns the enriched event unconditionally.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";

export interface RoundPoststartEvent extends EnrichedEvent {
  /**
   * Round number sourced from `gameRules.totalRoundsPlayed`. Defaults to
   * `0` when `gameRules` is unavailable.
   */
  readonly roundNumber: number;
}

export const enrichRoundPoststart: Enricher<RoundPoststartEvent> = (
  raw,
  ctx,
) => {
  const roundNumber = ctx.gameRules?.totalRoundsPlayed ?? 0;

  return freezeEvent<RoundPoststartEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    roundNumber,
  });
};
