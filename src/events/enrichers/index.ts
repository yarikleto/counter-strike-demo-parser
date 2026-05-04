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
import { enrichAnnouncePhaseEnd } from "./announcePhaseEnd.js";
import { enrichBeginNewMatch } from "./beginNewMatch.js";
import { enrichBombAbortDefuse } from "./bombAbortDefuse.js";
import { enrichBombAbortPlant } from "./bombAbortPlant.js";
import { enrichBombBeginDefuse } from "./bombBeginDefuse.js";
import { enrichBombBeginPlant } from "./bombBeginPlant.js";
import { enrichBombDefused } from "./bombDefused.js";
import { enrichBombDropped } from "./bombDropped.js";
import { enrichBombExploded } from "./bombExploded.js";
import { enrichBombPickedUp } from "./bombPickedUp.js";
import { enrichBombPlanted } from "./bombPlanted.js";
import { enrichBotTakeover } from "./botTakeover.js";
import { enrichBulletImpact } from "./bulletImpact.js";
import { enrichCsWinPanelMatch } from "./csWinPanelMatch.js";
import { enrichCsWinPanelRound } from "./csWinPanelRound.js";
import { enrichDecoyDetonate } from "./decoyDetonate.js";
import { enrichFlashbangDetonate } from "./flashbangDetonate.js";
import { enrichGrenadeBounce } from "./grenadeBounce.js";
import { enrichGrenadeThrown } from "./grenadeThrown.js";
import { enrichHeGrenadeDetonate } from "./heGrenadeDetonate.js";
import { enrichHostageHurt } from "./hostageHurt.js";
import { enrichHostagePickedUp } from "./hostagePickedUp.js";
import { enrichHostageRescued } from "./hostageRescued.js";
import { enrichInfernoExpired } from "./infernoExpired.js";
import { enrichItemEquip } from "./itemEquip.js";
import { enrichItemPickup } from "./itemPickup.js";
import { enrichItemPurchase } from "./itemPurchase.js";
import { enrichMatchEndConditions } from "./matchEndConditions.js";
import { enrichMolotovDetonate } from "./molotovDetonate.js";
import { enrichOtherDeath } from "./otherDeath.js";
import { enrichPlayerBlind } from "./playerBlind.js";
import { enrichPlayerConnect } from "./playerConnect.js";
import { enrichPlayerDeath } from "./playerDeath.js";
import { enrichPlayerDisconnect } from "./playerDisconnect.js";
import { enrichPlayerGivenC4 } from "./playerGivenC4.js";
import { enrichPlayerHurt } from "./playerHurt.js";
import { enrichPlayerSpawned } from "./playerSpawned.js";
import { enrichPlayerTeamChange } from "./playerTeamChange.js";
import { enrichRoundEnd } from "./roundEnd.js";
import { enrichRoundMvp } from "./roundMvp.js";
import { enrichRoundFreezeEnd } from "./roundFreezeEnd.js";
import { enrichRoundPoststart } from "./roundPoststart.js";
import { enrichRoundPrestart } from "./roundPrestart.js";
import { enrichRoundStart } from "./roundStart.js";
import { enrichSmokeGrenadeDetonate } from "./smokeGrenadeDetonate.js";
import { enrichSmokeGrenadeExpired } from "./smokeGrenadeExpired.js";
import { enrichWeaponFire } from "./weaponFire.js";
import { enrichWeaponReload } from "./weaponReload.js";
import { enrichWeaponZoom } from "./weaponZoom.js";

export const enricherTable: ReadonlyMap<string, Enricher> = new Map<
  string,
  Enricher
>([
  // Alphabetical by raw CS:GO event name.
  // TASK-039: bomb lifecycle events.
  ["bomb_abortdefuse", enrichBombAbortDefuse as Enricher],
  ["bomb_abortplant", enrichBombAbortPlant as Enricher],
  ["bomb_begindefuse", enrichBombBeginDefuse as Enricher],
  ["bomb_beginplant", enrichBombBeginPlant as Enricher],
  ["bomb_defused", enrichBombDefused as Enricher],
  ["bomb_dropped", enrichBombDropped as Enricher],
  ["bomb_exploded", enrichBombExploded as Enricher],
  ["bomb_pickup", enrichBombPickedUp as Enricher],
  ["bomb_planted", enrichBombPlanted as Enricher],
  // TASK-038: combat & player-action events.
  ["bullet_impact", enrichBulletImpact as Enricher],
  ["other_death", enrichOtherDeath as Enricher],
  ["player_blind", enrichPlayerBlind as Enricher],
  ["player_death", enrichPlayerDeath as Enricher],
  ["player_given_c4", enrichPlayerGivenC4 as Enricher],
  ["player_hurt", enrichPlayerHurt as Enricher],
  ["player_spawn", enrichPlayerSpawned as Enricher],
  // TASK-041: grenade lifecycle events.
  ["decoy_detonate", enrichDecoyDetonate as Enricher],
  ["flashbang_detonate", enrichFlashbangDetonate as Enricher],
  ["grenade_bounce", enrichGrenadeBounce as Enricher],
  ["grenade_thrown", enrichGrenadeThrown as Enricher],
  ["hegrenade_detonate", enrichHeGrenadeDetonate as Enricher],
  // TASK-045: hostage events.
  ["hostage_follows", enrichHostagePickedUp as Enricher],
  ["hostage_hurt", enrichHostageHurt as Enricher],
  ["hostage_rescued", enrichHostageRescued as Enricher],
  ["inferno_expire", enrichInfernoExpired as Enricher],
  // TASK-043: item lifecycle events.
  ["item_equip", enrichItemEquip as Enricher],
  ["item_pickup", enrichItemPickup as Enricher],
  ["item_purchase", enrichItemPurchase as Enricher],
  ["molotov_detonate", enrichMolotovDetonate as Enricher],
  ["smokegrenade_detonate", enrichSmokeGrenadeDetonate as Enricher],
  ["smokegrenade_expired", enrichSmokeGrenadeExpired as Enricher],
  // TASK-042: player connection lifecycle events.
  ["player_connect", enrichPlayerConnect as Enricher],
  ["player_disconnect", enrichPlayerDisconnect as Enricher],
  ["player_team", enrichPlayerTeamChange as Enricher],
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
  // TASK-046: miscellaneous match-state events. Alphabetical by raw event name.
  ["announce_phase_end", enrichAnnouncePhaseEnd as Enricher],
  ["begin_new_match", enrichBeginNewMatch as Enricher],
  ["bot_takeover", enrichBotTakeover as Enricher],
  ["cs_win_panel_match", enrichCsWinPanelMatch as Enricher],
  ["cs_win_panel_round", enrichCsWinPanelRound as Enricher],
  ["match_end_conditions", enrichMatchEndConditions as Enricher],
  ["round_mvp", enrichRoundMvp as Enricher],
]);

export type { Enricher, EnrichedEvent };
export { freezeEvent } from "./Enricher.js";
