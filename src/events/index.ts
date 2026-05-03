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
export { buildEnricherContext } from "./EnricherContext.js";
export type { EnricherContext } from "./EnricherContext.js";
export { freezeEvent, enricherTable } from "./enrichers/index.js";
export type { Enricher, EnrichedEvent } from "./enrichers/Enricher.js";
// TASK-038: combat & player-action event types + HitGroup enum.
export type { PlayerDeathEvent } from "./enrichers/playerDeath.js";
export type { PlayerHurtEvent } from "./enrichers/playerHurt.js";
export type { PlayerBlindEvent } from "./enrichers/playerBlind.js";
export type { PlayerSpawnedEvent } from "./enrichers/playerSpawned.js";
export type { PlayerGivenC4Event } from "./enrichers/playerGivenC4.js";
export type { BulletImpactEvent } from "./enrichers/bulletImpact.js";
export type { OtherDeathEvent } from "./enrichers/otherDeath.js";
export { HitGroup } from "../enums/HitGroup.js";
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
