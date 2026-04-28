/**
 * TeamSide — CS:GO team numeric identifiers.
 *
 * These values match Valve's encoding exactly (see `m_iTeamNum` on
 * CCSPlayerController and the team enum in `cstrike15_gcconstants.h` /
 * `shareddefs.h`). Do NOT renumber — they are assigned directly from
 * decoded entity / protobuf fields without translation.
 *
 * - 0: Unassigned (player has not joined a team yet)
 * - 1: Spectator
 * - 2: Terrorists
 * - 3: Counter-Terrorists
 */
export const TeamSide = {
  Unassigned: 0,
  Spectator: 1,
  T: 2,
  CT: 3,
} as const;

export type TeamSide = (typeof TeamSide)[keyof typeof TeamSide];
