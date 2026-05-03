/**
 * RoundEndReason — CS:GO `round_end` event reason codes.
 *
 * Values match Valve's `gamerules.cpp` `RoundEndReason_t` constants exactly
 * and are assigned directly from the decoded `round_end` event's `reason`
 * field without translation. The Tier-1 `RoundEndEvent.reason` field is
 * typed `RoundEndReason | number` per ADR-006 decision 4 — unknown integers
 * pass through as raw `number` for forward-compat with newer server builds
 * that ship additional reasons.
 *
 * Coverage below is the canonical CS:GO competitive set; less-common reasons
 * (game-mode-specific terror strike rounds, training rounds) emit as raw
 * integers and are not enumerated here. Adding a value to this enum is a
 * NON-breaking change — consumers who matched on the integer keep working,
 * and the new symbolic name becomes available.
 *
 * - 1: TargetBombed (T win — bomb detonated)
 * - 7: BombDefused (CT win — bomb defused)
 * - 8: CTWin (CT eliminated all Ts)
 * - 9: TWin (T eliminated all CTs)
 * - 10: Draw (round timer expired with bomb not planted; CT win in standard
 *   competitive but engine emits Draw on some game-modes)
 * - 12: TerroristsEscaped (escape game mode — Ts escaped the map)
 * - 13: CTStoppedEscape (escape game mode — CTs prevented all escapes)
 * - 16: HostagesRescued (CT win — all hostages rescued)
 */
export const RoundEndReason = {
  TargetBombed: 1,
  BombDefused: 7,
  CTWin: 8,
  TWin: 9,
  Draw: 10,
  TerroristsEscaped: 12,
  CTStoppedEscape: 13,
  HostagesRescued: 16,
} as const;

export type RoundEndReason = (typeof RoundEndReason)[keyof typeof RoundEndReason];
