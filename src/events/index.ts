/**
 * Barrel export for the events module.
 *
 * Re-exports the TypedEventEmitter class plus the `EventMap` and `Listener`
 * helper types that consumers (and future parser modules) will use to declare
 * their event maps.
 */
export { TypedEventEmitter } from "./TypedEventEmitter.js";
export type { EventMap, Listener } from "./TypedEventEmitter.js";
export {
  EventDescriptorTable,
  buildDescriptorTable,
} from "./EventDescriptorTable.js";
export type {
  EventDescriptor,
  EventKeyDescriptor,
  EventKeyType,
} from "./EventDescriptor.js";
export { eventKeyTypeFromWire } from "./EventDescriptor.js";
export { decodeGameEvent } from "./GameEventDecoder.js";
export type { DecodedGameEvent } from "./GameEventDecoder.js";
export { decodeChatMessage } from "./UserMessageDecoder.js";
export type { ChatMessage, ChatMessageContext } from "./UserMessageDecoder.js";
export { buildEnricherContext } from "./EnricherContext.js";
export type { EnricherContext } from "./EnricherContext.js";
export { freezeEvent, enricherTable } from "./enrichers/index.js";
export type { Enricher, EnrichedEvent } from "./enrichers/Enricher.js";
// TASK-039: bomb lifecycle event types.
export type { BombPlantedEvent } from "./enrichers/bombPlanted.js";
export type { BombDefusedEvent } from "./enrichers/bombDefused.js";
export type { BombExplodedEvent } from "./enrichers/bombExploded.js";
export type { BombPickedUpEvent } from "./enrichers/bombPickedUp.js";
export type { BombDroppedEvent } from "./enrichers/bombDropped.js";
export type { BombBeginPlantEvent } from "./enrichers/bombBeginPlant.js";
export type { BombAbortPlantEvent } from "./enrichers/bombAbortPlant.js";
export type { BombBeginDefuseEvent } from "./enrichers/bombBeginDefuse.js";
export type { BombAbortDefuseEvent } from "./enrichers/bombAbortDefuse.js";
// TASK-038: combat & player-action event types + HitGroup enum.
export type { PlayerDeathEvent } from "./enrichers/playerDeath.js";
export type { PlayerHurtEvent } from "./enrichers/playerHurt.js";
export type { PlayerBlindEvent } from "./enrichers/playerBlind.js";
export type { PlayerSpawnedEvent } from "./enrichers/playerSpawned.js";
export type { PlayerGivenC4Event } from "./enrichers/playerGivenC4.js";
export type { BulletImpactEvent } from "./enrichers/bulletImpact.js";
export type { OtherDeathEvent } from "./enrichers/otherDeath.js";
export { HitGroup } from "../enums/HitGroup.js";
// TASK-041: grenade lifecycle event types.
export type { GrenadeThrownEvent } from "./enrichers/grenadeThrown.js";
export type { GrenadeBounceEvent } from "./enrichers/grenadeBounce.js";
export type { HeGrenadeDetonateEvent } from "./enrichers/heGrenadeDetonate.js";
export type { FlashbangDetonateEvent } from "./enrichers/flashbangDetonate.js";
export type { SmokeGrenadeDetonateEvent } from "./enrichers/smokeGrenadeDetonate.js";
export type { SmokeGrenadeExpiredEvent } from "./enrichers/smokeGrenadeExpired.js";
export type { MolotovDetonateEvent } from "./enrichers/molotovDetonate.js";
export type { InfernoExpiredEvent } from "./enrichers/infernoExpired.js";
export type { DecoyDetonateEvent } from "./enrichers/decoyDetonate.js";
// TASK-042: player connection lifecycle event types.
export type { PlayerConnectEvent } from "./enrichers/playerConnect.js";
export type { PlayerDisconnectEvent } from "./enrichers/playerDisconnect.js";
export type { PlayerTeamChangeEvent } from "./enrichers/playerTeamChange.js";
// TASK-040: round lifecycle event types + RoundEndReason enum.
export type { RoundStartEvent } from "./enrichers/roundStart.js";
export type { RoundEndEvent } from "./enrichers/roundEnd.js";
export type { RoundFreezeEndEvent } from "./enrichers/roundFreezeEnd.js";
export type { RoundPrestartEvent } from "./enrichers/roundPrestart.js";
export type { RoundPoststartEvent } from "./enrichers/roundPoststart.js";
export { RoundEndReason } from "../enums/RoundEndReason.js";
// TASK-044: weapon event types.
export type { WeaponFireEvent } from "./enrichers/weaponFire.js";
export type { WeaponReloadEvent } from "./enrichers/weaponReload.js";
export type { WeaponZoomEvent } from "./enrichers/weaponZoom.js";
// TASK-045: hostage event types.
export type { HostageRescuedEvent } from "./enrichers/hostageRescued.js";
export type { HostagePickedUpEvent } from "./enrichers/hostagePickedUp.js";
export type { HostageHurtEvent } from "./enrichers/hostageHurt.js";
// TASK-043: item lifecycle event types.
export type { ItemPickupEvent } from "./enrichers/itemPickup.js";
export type { ItemPurchaseEvent } from "./enrichers/itemPurchase.js";
export type { ItemEquipEvent } from "./enrichers/itemEquip.js";
// TASK-046: miscellaneous match-state event types.
export type { BeginNewMatchEvent } from "./enrichers/beginNewMatch.js";
export type { RoundMvpEvent } from "./enrichers/roundMvp.js";
export type { AnnouncePhaseEndEvent } from "./enrichers/announcePhaseEnd.js";
export type { CsWinPanelMatchEvent } from "./enrichers/csWinPanelMatch.js";
export type { CsWinPanelRoundEvent } from "./enrichers/csWinPanelRound.js";
export type { MatchEndConditionsEvent } from "./enrichers/matchEndConditions.js";
export type { BotTakeoverEvent } from "./enrichers/botTakeover.js";
