/**
 * `match_end_conditions` Tier-1 enricher (TASK-046, ADR-006).
 *
 * Wire schema (verified against de_nuke.dem descriptor table):
 *   { frags: long, max_rounds: long, win_rounds: long, time: long }
 *
 * Fires once at match start, broadcasting the configured win-conditions
 * for the match (mp_maxrounds, mp_winrounds, mp_fraglimit, mp_timelimit).
 * Useful for downstream consumers that need to know whether the match is
 * MR15/MR12/wingman/competitive without inferring it from round counts.
 *
 * Field name mapping (ADR-006 decision 6, ADR-005 overlay rules — strip
 * underscores, camelCase): `max_rounds` -> `maxRounds`, `win_rounds` ->
 * `winRounds`. `frags` and `time` are already camelCase-clean.
 *
 * On de_nuke this event was not observed (count=0 per probe — the
 * fixture's bots-only match ran without the broadcast). The enricher is
 * still wired to surface it whenever a competitive demo emits it.
 *
 * Returns the enriched event unconditionally — every field has a safe
 * default of 0.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";

export interface MatchEndConditionsEvent extends EnrichedEvent {
  /** Frag limit (mp_fraglimit); `0` when no frag limit configured. */
  readonly frags: number;
  /** Max rounds in the match (mp_maxrounds). */
  readonly maxRounds: number;
  /** Rounds required to win the match (mp_winrounds). */
  readonly winRounds: number;
  /** Time limit in minutes (mp_timelimit); `0` when no time limit. */
  readonly time: number;
}

export const enrichMatchEndConditions: Enricher<MatchEndConditionsEvent> = (
  raw,
) => {
  const frags = typeof raw.data.frags === "number" ? raw.data.frags : 0;
  const maxRounds =
    typeof raw.data.max_rounds === "number" ? raw.data.max_rounds : 0;
  const winRounds =
    typeof raw.data.win_rounds === "number" ? raw.data.win_rounds : 0;
  const time = typeof raw.data.time === "number" ? raw.data.time : 0;

  return freezeEvent<MatchEndConditionsEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    frags,
    maxRounds,
    winRounds,
    time,
  });
};
