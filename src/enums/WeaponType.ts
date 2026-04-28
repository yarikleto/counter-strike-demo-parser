/**
 * WeaponType — coarse weapon category for CS:GO weapons.
 *
 * WARNING: these numeric values are an INTERNAL categorization, NOT
 * Valve's `WEAPONTYPE_*` enum from `weapons_cs_shared.cpp`. Valve's enum
 * is more granular (it splits e.g. `WEAPONTYPE_GRENADE` from
 * `WEAPONTYPE_MACHINEGUN`, has separate `WEAPONTYPE_TASER`,
 * `WEAPONTYPE_STACKABLEITEM`, etc.). The real numeric values will land
 * in a later task once the protobufs are vendored and the canonical
 * enum can be re-exported. Until then, do NOT rely on these integers
 * matching anything decoded from a demo — assign via the symbolic
 * constants only (e.g. `WeaponType.Rifle`), never via raw `2`.
 *
 * Members required by TASK-012:
 *   Knife, Pistol, SMG, Rifle, Shotgun, MachineGun, Sniper, Grenade,
 *   C4, Equipment.
 */
export const WeaponType = {
  Knife: 0,
  Pistol: 1,
  SMG: 2,
  Rifle: 3,
  Shotgun: 4,
  MachineGun: 5,
  Sniper: 6,
  Grenade: 7,
  C4: 8,
  Equipment: 9,
} as const;

export type WeaponType = (typeof WeaponType)[keyof typeof WeaponType];
