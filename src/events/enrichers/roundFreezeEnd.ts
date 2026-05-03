/**
 * `round_freeze_end` Tier-1 enricher (TASK-040, ADR-006).
 *
 * Wire schema: empty (no payload keys). The event signals that the buy-time
 * freeze period is over and players are free to move — i.e. the round is
 * "live." The Tier-1 payload exposes only the inherited `eventName` /
 * `eventId` plus `roundNumber` from `gameRules.totalRoundsPlayed`.
 *
 * Returns the enriched event unconditionally (never null) — there is no
 * structurally-unrepresentable case for a payload-less event.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";

export interface RoundFreezeEndEvent extends EnrichedEvent {
  /**
   * Round number sourced from `gameRules.totalRoundsPlayed`. Defaults to
   * `0` when `gameRules` is unavailable.
   */
  readonly roundNumber: number;
}

export const enrichRoundFreezeEnd: Enricher<RoundFreezeEndEvent> = (
  raw,
  ctx,
) => {
  const roundNumber = ctx.gameRules?.totalRoundsPlayed ?? 0;

  return freezeEvent<RoundFreezeEndEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    roundNumber,
  });
};
