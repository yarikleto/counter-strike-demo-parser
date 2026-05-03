/**
 * Tier-1 enricher registry (ADR-006 decision 5).
 *
 * Static lookup table mapping CS:GO raw event name (e.g. `"player_death"`)
 * to the Tier-1 enricher function for that event. The dispatcher in
 * `DemoParser.handleGameEvent` consults this map after every Tier-2 emit;
 * if a registered enricher exists, it runs and the camelCase Tier-1 event
 * fires on the parser.
 *
 * Population: TASK-038 (combat & player actions), TASK-040 (round
 * lifecycle), and TASK-044 (weapons) have landed. Remaining categories
 * arrive via TASK-039 / 041 / 042 / 043 / 045 / 046 / 047. Each per-category
 * task adds its enricher in its own per-event file (e.g.
 * `./playerDeath.ts` exporting `enrichPlayerDeath` plus the
 * `PlayerDeathEvent` type, per ADR-006 decision 6) and registers it here.
 *
 * Per-file enrichers (rather than a category-grouped file) avoid merge
 * conflicts when nine TASK-038…046 developers fan out in parallel.
 *
 * `ReadonlyMap<string, Enricher>`: the public type forbids runtime mutation
 * — a registry pattern (`registerEnricher(...)`) was rejected per ADR-006
 * decision 2 because the set of enriched events is closed at TASK-048
 * freeze. New events ship via a new release, not a runtime call.
 */
import type { Enricher, EnrichedEvent } from "./Enricher.js";
import { enrichBulletImpact } from "./bulletImpact.js";
import { enrichOtherDeath } from "./otherDeath.js";
import { enrichPlayerBlind } from "./playerBlind.js";
import { enrichPlayerDeath } from "./playerDeath.js";
import { enrichPlayerGivenC4 } from "./playerGivenC4.js";
import { enrichPlayerHurt } from "./playerHurt.js";
import { enrichPlayerSpawned } from "./playerSpawned.js";
import { enrichRoundEnd } from "./roundEnd.js";
import { enrichRoundFreezeEnd } from "./roundFreezeEnd.js";
import { enrichRoundPoststart } from "./roundPoststart.js";
import { enrichRoundPrestart } from "./roundPrestart.js";
import { enrichRoundStart } from "./roundStart.js";
import { enrichWeaponFire } from "./weaponFire.js";
import { enrichWeaponReload } from "./weaponReload.js";
import { enrichWeaponZoom } from "./weaponZoom.js";

export const enricherTable: ReadonlyMap<string, Enricher> = new Map<
  string,
  Enricher
>([
  // Alphabetical by raw CS:GO event name.
  // TASK-038: combat & player-action events.
  ["bullet_impact", enrichBulletImpact as Enricher],
  ["other_death", enrichOtherDeath as Enricher],
  ["player_blind", enrichPlayerBlind as Enricher],
  ["player_death", enrichPlayerDeath as Enricher],
  ["player_given_c4", enrichPlayerGivenC4 as Enricher],
  ["player_hurt", enrichPlayerHurt as Enricher],
  ["player_spawn", enrichPlayerSpawned as Enricher],
  // TASK-040: round lifecycle events. Alphabetical by raw event name.
  ["round_end", enrichRoundEnd as Enricher],
  ["round_freeze_end", enrichRoundFreezeEnd as Enricher],
  ["round_poststart", enrichRoundPoststart as Enricher],
  ["round_prestart", enrichRoundPrestart as Enricher],
  ["round_start", enrichRoundStart as Enricher],
  // TASK-044: weapon events. Alphabetical by raw event name.
  ["weapon_fire", enrichWeaponFire as Enricher],
  ["weapon_reload", enrichWeaponReload as Enricher],
  ["weapon_zoom", enrichWeaponZoom as Enricher],
]);

export type { Enricher, EnrichedEvent };
export { freezeEvent } from "./Enricher.js";
