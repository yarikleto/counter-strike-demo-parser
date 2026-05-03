/**
 * `round_start` Tier-1 enricher (TASK-040, ADR-006).
 *
 * Wire schema (CS:GO event descriptor):
 *   { timelimit: long, fraglimit: long, objective: string }
 *
 * `round_start` carries no `userid` — it is emitted by the engine when a
 * fresh round begins and applies to all players. The Tier-1 payload is a
 * straight rename to camelCase plus a stamped `roundNumber` sourced from
 * `gameRules.totalRoundsPlayed` (per ADR-006 decision 1 round numbering
 * rule). Missing fields coerce to safe defaults rather than throwing — a
 * forward-compat server build could omit a key, and dropping a round-start
 * event is strictly worse than emitting one with `0` / `""` for the absent
 * field.
 *
 * Returns the enriched event unconditionally (never null) — there is no
 * structurally-unrepresentable case for a round_start.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";

export interface RoundStartEvent extends EnrichedEvent {
  /** Round time limit in seconds (e.g. 115 on competitive). */
  readonly timeLimit: number;
  /** Frag limit (typically 0 in standard competitive — round ends on objective). */
  readonly fragLimit: number;
  /** Objective string (e.g. `"BOMB TARGET"` on de-maps, `"HOSTAGE RESCUE"` on cs-maps). */
  readonly objective: string;
  /**
   * Current round number sourced from `gameRules.totalRoundsPlayed`. `0`
   * before the first completed round, increments after each `round_end`.
   * Defaults to `0` when `gameRules` is unavailable (e.g. event fires before
   * the CCSGameRules entity has been observed).
   */
  readonly roundNumber: number;
}

export const enrichRoundStart: Enricher<RoundStartEvent> = (raw, ctx) => {
  const timeLimit =
    typeof raw.data.timelimit === "number" ? raw.data.timelimit : 0;
  const fragLimit =
    typeof raw.data.fraglimit === "number" ? raw.data.fraglimit : 0;
  const objective =
    typeof raw.data.objective === "string" ? raw.data.objective : "";
  const roundNumber = ctx.gameRules?.totalRoundsPlayed ?? 0;

  return freezeEvent<RoundStartEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    timeLimit,
    fragLimit,
    objective,
    roundNumber,
  });
};
