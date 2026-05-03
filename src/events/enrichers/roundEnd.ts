/**
 * `round_end` Tier-1 enricher (TASK-040, ADR-006).
 *
 * Wire schema (CS:GO event descriptor):
 *   { winner: byte, reason: byte, message: string }
 *
 * `winner` maps directly to the `TeamSide` enum (values 0/1/2/3 — same wire
 * encoding as `m_iTeamNum`). `reason` maps to `RoundEndReason` when the
 * value is in the enum's value set; unknown values pass through as raw
 * `number` per ADR-006 decision 4 (forward-compat with newer server builds
 * that ship additional reason codes). The Tier-1 type is
 * `RoundEndReason | number` — documented in JSDoc.
 *
 * `roundNumber` is sourced from `gameRules.totalRoundsPlayed` at the moment
 * of the event — the engine increments `totalRoundsPlayed` AFTER firing
 * `round_end`, so the stamped value is the round that just ended (1-based
 * for the first completed round? — the field is 0-based, see GameRules.ts:79
 * "completed rounds in this match (0-based)"). This matches the
 * `RoundStateChange.roundNumber` semantics from RoundTracker.
 *
 * Missing fields coerce to safe defaults: `winner` to `TeamSide.Unassigned`
 * (0), `reason` to `0` (raw integer pass-through), `message` to `""`.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import { TeamSide } from "../../enums/TeamSide.js";
import { RoundEndReason } from "../../enums/RoundEndReason.js";

export interface RoundEndEvent extends EnrichedEvent {
  /** Winning team side (`TeamSide.T`, `TeamSide.CT`, or `TeamSide.Unassigned` for draws/edge cases). */
  readonly winner: TeamSide;
  /**
   * Round end reason. Symbolic values from {@link RoundEndReason} when the
   * wire integer matches a known reason; raw `number` for forward-compat
   * with newer server builds shipping unknown reason codes.
   */
  readonly reason: RoundEndReason | number;
  /** Localization key for the end-of-round notice (e.g. `"#SFUI_Notice_Bomb_Defused"`). */
  readonly message: string;
  /**
   * Round number sourced from `gameRules.totalRoundsPlayed` at the moment
   * of the event. Defaults to `0` when `gameRules` is unavailable.
   */
  readonly roundNumber: number;
}

const KNOWN_REASONS = new Set<number>(Object.values(RoundEndReason));

export const enrichRoundEnd: Enricher<RoundEndEvent> = (raw, ctx) => {
  const winnerRaw = raw.data.winner;
  const winner: TeamSide =
    typeof winnerRaw === "number" ? (winnerRaw as TeamSide) : TeamSide.Unassigned;

  const reasonRaw = raw.data.reason;
  const reason: RoundEndReason | number =
    typeof reasonRaw === "number"
      ? KNOWN_REASONS.has(reasonRaw)
        ? (reasonRaw as RoundEndReason)
        : reasonRaw
      : 0;

  const message =
    typeof raw.data.message === "string" ? raw.data.message : "";
  const roundNumber = ctx.gameRules?.totalRoundsPlayed ?? 0;

  return freezeEvent<RoundEndEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    winner,
    reason,
    message,
    roundNumber,
  });
};
