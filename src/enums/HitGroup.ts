/**
 * HitGroup — Source / CS:GO hitbox group identifiers.
 *
 * Values match Valve's `HITGROUP_*` constants from `shareddefs.h` exactly
 * and are assigned directly from decoded `player_hurt` / `player_death`
 * event fields without translation.
 *
 * - 0: Generic (no specific hitgroup, e.g. world damage / fall)
 * - 1: Head
 * - 2: Chest
 * - 3: Stomach
 * - 4: LeftArm
 * - 5: RightArm
 * - 6: LeftLeg
 * - 7: RightLeg
 * - 10: Gear (helmet/armor — rarely emitted)
 *
 * NOTE: hitgroup IDs 8 and 9 are intentionally unused in Source / CS:GO.
 * Do not invent values for them.
 */
export const HitGroup = {
  Generic: 0,
  Head: 1,
  Chest: 2,
  Stomach: 3,
  LeftArm: 4,
  RightArm: 5,
  LeftLeg: 6,
  RightLeg: 7,
  Gear: 10,
} as const;

export type HitGroup = (typeof HitGroup)[keyof typeof HitGroup];
