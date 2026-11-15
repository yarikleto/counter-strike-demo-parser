/**
 * CS:GO item definition indices (`m_iItemDefinitionIndex`) → weapon names.
 *
 * Names match the `weapon` strings of game events (`player_death`,
 * `item_equip`, …) without the `weapon_` prefix, e.g. 7 → "ak47". The item
 * definition index is the reliable identity of a weapon entity: several
 * weapons share a ServerClass (`CWeaponM4A1` is both M4A4 and M4A1-S,
 * `CWeaponHKP2000` both P2000 and USP-S). All finishes of a knife map to
 * "knife".
 */
const NAMES: Readonly<Record<number, string>> = {
  1: "deagle",
  2: "elite",
  3: "fiveseven",
  4: "glock",
  7: "ak47",
  8: "aug",
  9: "awp",
  10: "famas",
  11: "g3sg1",
  13: "galilar",
  14: "m249",
  16: "m4a1",
  17: "mac10",
  19: "p90",
  23: "mp5sd",
  24: "ump45",
  25: "xm1014",
  26: "bizon",
  27: "mag7",
  28: "negev",
  29: "sawedoff",
  30: "tec9",
  31: "taser",
  32: "hkp2000",
  33: "mp7",
  34: "mp9",
  35: "nova",
  36: "p250",
  37: "shield",
  38: "scar20",
  39: "sg556",
  40: "ssg08",
  41: "knifegg",
  42: "knife",
  43: "flashbang",
  44: "hegrenade",
  45: "smokegrenade",
  46: "molotov",
  47: "decoy",
  48: "incgrenade",
  49: "c4",
  57: "healthshot",
  59: "knife",
  60: "m4a1_silencer",
  61: "usp_silencer",
  63: "cz75a",
  64: "revolver",
  68: "tagrenade",
  69: "fists",
  70: "breachcharge",
  72: "tablet",
  74: "melee",
  75: "axe",
  76: "hammer",
  78: "spanner",
  80: "knife",
  81: "firebomb",
  82: "diversion",
  83: "frag_grenade",
  84: "snowball",
  85: "bumpmine",
};

/** First and last item definition index used by knife finishes (bayonet … skeleton). */
const KNIFE_RANGE_START = 500;
const KNIFE_RANGE_END = 525;

/**
 * Weapon name for an item definition index, or `undefined` for unknown
 * indices and 0 (no weapon).
 */
export function weaponNameForItemDefIndex(index: number): string | undefined {
  if (index >= KNIFE_RANGE_START && index <= KNIFE_RANGE_END) return "knife";
  return NAMES[index];
}
