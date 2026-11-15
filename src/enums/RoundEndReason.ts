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
 * The numbering is Valve's `e_RoundEndReason` + 1 (0 = still in progress),
 * the same table demoinfocs-golang exposes as `events.RoundEndReason`.
 * Verified on real demos: 1 bomb exploded, 7 defused, 8/9 elimination,
 * 12 time ran out on a bomb map, 16 "Game Commencing" (winner = spectator)
 * when the first players join. Adding a value to this enum is a NON-breaking
 * change — consumers who matched on the integer keep working.
 */
export const RoundEndReason = {
  TargetBombed: 1,
  VIPEscaped: 2,
  VIPKilled: 3,
  TerroristsEscaped: 4,
  CTStoppedEscape: 5,
  TerroristsStopped: 6,
  BombDefused: 7,
  CTWin: 8,
  TWin: 9,
  Draw: 10,
  HostagesRescued: 11,
  /** CT win: the round timer ran out on a bomb map without a plant. */
  TargetSaved: 12,
  HostagesNotRescued: 13,
  TerroristsNotEscaped: 14,
  VIPNotEscaped: 15,
  /** "Game Commencing" pseudo round end when a match first starts — not a played round. */
  GameStart: 16,
  TerroristsSurrender: 17,
  CTSurrender: 18,
} as const;

export type RoundEndReason = (typeof RoundEndReason)[keyof typeof RoundEndReason];
