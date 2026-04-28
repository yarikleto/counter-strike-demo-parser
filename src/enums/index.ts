/**
 * Barrel re-export for game enums.
 *
 * Each enum is exported as both a runtime value object (for the
 * symbolic constants, e.g. `TeamSide.CT`) and a type alias of the
 * union of its value literals (for use in type annotations). The
 * single named re-export carries both meanings (TS declaration
 * merging) so consumers can write `import { TeamSide } from "@enums"`
 * and use it in either position.
 */
export { TeamSide } from "./TeamSide.js";
export { WeaponType } from "./WeaponType.js";
export { HitGroup } from "./HitGroup.js";
