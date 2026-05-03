/**
 * Tier-1 enricher registry (ADR-006 decision 5).
 *
 * Static lookup table mapping CS:GO raw event name (e.g. `"player_death"`)
 * to the Tier-1 enricher function for that event. The dispatcher in
 * `DemoParser.handleGameEvent` consults this map after every Tier-2 emit;
 * if a registered enricher exists, it runs and the camelCase Tier-1 event
 * fires on the parser.
 *
 * Population: empty until TASK-038 through TASK-047 land. Each per-category
 * task adds its enricher in its own per-event file (e.g.
 * `./playerDeath.ts` exporting `enrichPlayerDeath` plus the
 * `PlayerDeathEvent` type, per ADR-006 decision 6) and registers it here:
 *
 *     import { enrichPlayerDeath } from "./playerDeath.js";
 *     ["player_death", enrichPlayerDeath],
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

export const enricherTable: ReadonlyMap<string, Enricher> = new Map<
  string,
  Enricher
>([
  // TASK-038: ["player_death", enrichPlayerDeath],
  // TASK-039: ["bomb_planted", enrichBombPlanted],
  // TASK-040: ["bomb_defused", enrichBombDefused],
  // TASK-041: ["weapon_fire", enrichWeaponFire],
  // TASK-042: ["round_start", enrichRoundStart],
  // ... TASK-043 through TASK-047 fill in the remaining categories.
]);

export type { Enricher, EnrichedEvent };
export { freezeEvent } from "./Enricher.js";
