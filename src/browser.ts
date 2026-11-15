/**
 * counter-strike-demo-parser — browser-safe entry point.
 *
 * Everything here runs in browsers, Web Workers and Node alike: input is a
 * `Uint8Array` / `ArrayBuffer`, and no Node built-ins are imported. Node
 * users get file-path / stream conveniences from the "node" entry
 * (`counter-strike-demo-parser/node`, or the bare specifier under Node).
 *
 * @example
 * ```ts
 * import { parseDemo } from "counter-strike-demo-parser";
 *
 * const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
 * const result = await parseDemo(bytes, { collectPlayerPositions: true });
 * ```
 */
export { DemoParser } from "./DemoParser.js";
export type { ParseProgress, ParseProgressOptions } from "./DemoParser.js";
export { parseDemo } from "./parseDemo.js";
export { ByteReader } from "./reader/ByteReader.js";
export { parseHeader } from "./frame/header.js";
export type { DemoHeader } from "./frame/header.js";
export { DemoCommands } from "./frame/DemoCommands.js";
export type { DemoCommand } from "./frame/DemoCommands.js";
export { iterateFrames } from "./frame/FrameParser.js";
export type { Frame, FrameHeader } from "./frame/FrameParser.js";
export { MessageDispatcher, iterateRawMessages } from "./packet/MessageDispatch.js";
export type { MessageHandlers, RawPacketMessage } from "./packet/MessageDispatch.js";
export type { CSVCMsg_ServerInfo, CNETMsg_Tick } from "./proto/index.js";
export type {
  SendTable,
  SendProp,
  SendPropTypeValue,
  ServerClass,
  FlattenedSendProp,
  DataTablesParseResult,
} from "./datatables/index.js";
export { SendPropType } from "./datatables/index.js";
export { parseDataTables } from "./datatables/index.js";
export type { SendTableRegistry } from "./datatables/SendTableRegistry.js";
export type { ServerClassRegistry } from "./datatables/ServerClassRegistry.js";
export { StringTable, StringTableManager } from "./stringtables/index.js";
export type {
  StringTableEntry,
  StringTableOptions,
  ParseStringTableResult,
} from "./stringtables/index.js";
export { PrecacheTable } from "./stringtables/precache.js";
export { parseStringTableSnapshot } from "./stringtables/SnapshotParser.js";
export type {
  DecodedStringTableSnapshot,
  DecodedSnapshotTable,
  DecodedSnapshotEntry,
} from "./stringtables/SnapshotParser.js";
export { decodeProp } from "./properties/index.js";
export type { PropertyValue, Vector2, Vector3 } from "./properties/index.js";
export { Entity, EntityList, MAX_EDICTS } from "./entities/index.js";
export {
  EntityClassMismatchError,
  StaleEntityError,
  BitStreamMisalignmentError,
} from "./entities/index.js";
export {
  INVALID_HANDLE,
  handleToIndex,
  handleToSerial,
  isValidHandle,
  resolveHandle,
} from "./state/index.js";
export { SteamId, SteamIdParseError } from "./utils/SteamId.js";
export type { TypedServerInfo } from "./state/index.js";
export {
  Player,
  Weapon,
  PlayerResource,
  MAX_PLAYER_SLOTS,
  RoundTracker,
  computeRoundPhase,
  UserInfoIndex,
} from "./state/index.js";
export type {
  ViewAngle,
  PlayerSnapshot,
  WeaponSnapshot,
  PlayerResourceSnapshot,
  RoundStateChange,
  RoundPhase,
  RoundPhaseInputs,
  UserInfo,
} from "./state/index.js";

// Public event-map type.
export type { ParserEventMap } from "./events/index.js";

// Game events: typed event-map (Tier-2 catch-all + Tier-1 enrichers).
export {
  buildDescriptorTable,
  EventDescriptorTable,
  decodeGameEvent,
  decodeChatMessage,
  buildEnricherContext,
  enricherTable,
  freezeEvent,
} from "./events/index.js";
export type {
  EventDescriptor,
  EventKeyDescriptor,
  EventKeyType,
  DecodedGameEvent,
  // TASK-047: chat / user-message decoder.
  ChatMessage,
  ChatMessageContext,
  EnricherContext,
  Enricher,
  EnrichedEvent,
  // Bomb lifecycle (TASK-039)
  BombPlantedEvent,
  BombDefusedEvent,
  BombExplodedEvent,
  BombPickedUpEvent,
  BombDroppedEvent,
  BombBeginPlantEvent,
  BombAbortPlantEvent,
  BombBeginDefuseEvent,
  BombAbortDefuseEvent,
  // Combat (TASK-038)
  PlayerDeathEvent,
  PlayerHurtEvent,
  PlayerBlindEvent,
  PlayerSpawnedEvent,
  PlayerGivenC4Event,
  BulletImpactEvent,
  OtherDeathEvent,
  // Grenade lifecycle (TASK-041)
  GrenadeThrownEvent,
  GrenadeBounceEvent,
  HeGrenadeDetonateEvent,
  FlashbangDetonateEvent,
  SmokeGrenadeDetonateEvent,
  SmokeGrenadeExpiredEvent,
  MolotovDetonateEvent,
  InfernoExpiredEvent,
  DecoyDetonateEvent,
  // Player lifecycle (TASK-042)
  PlayerConnectEvent,
  PlayerDisconnectEvent,
  PlayerTeamChangeEvent,
  // Round (TASK-040)
  RoundStartEvent,
  RoundEndEvent,
  RoundFreezeEndEvent,
  RoundPrestartEvent,
  RoundPoststartEvent,
  // Weapon (TASK-044)
  WeaponFireEvent,
  WeaponReloadEvent,
  WeaponZoomEvent,
  // Hostage (TASK-045)
  HostageRescuedEvent,
  HostagePickedUpEvent,
  HostageHurtEvent,
  // Item lifecycle (TASK-043)
  ItemPickupEvent,
  ItemPurchaseEvent,
  ItemEquipEvent,
  // Miscellaneous match state (TASK-046)
  BeginNewMatchEvent,
  RoundMvpEvent,
  AnnouncePhaseEndEvent,
  CsWinPanelMatchEvent,
  CsWinPanelRoundEvent,
  MatchEndConditionsEvent,
  BotTakeoverEvent,
} from "./events/index.js";
export { HitGroup, RoundEndReason } from "./enums/index.js";

// Convenience async API (ADR-009): plain-data results.
export type { DemoResult, ParseOptions } from "./convenience/DemoResult.js";
export type {
  RoundSummary,
  RoundPlayerStats,
  RoundPlayerEconomy,
  RoundBombEvents,
  MatchScore,
} from "./convenience/RoundTracker.js";
export type { PlayerRef, PlayerInfo } from "./convenience/PlayerRoster.js";
export type {
  KillRecord,
  BombRecord,
  BombEventType,
  GrenadeThrow,
  GrenadeEffect,
  GrenadeEffectType,
  HostageRecord,
  HostageEventType,
  ChatRecord,
  DamageRecord,
} from "./convenience/records.js";
export { PositionFlags, positionBuffers } from "./convenience/PositionRecorder.js";
export type { PlayerPositions } from "./convenience/PositionRecorder.js";
export { weaponNameForItemDefIndex } from "./enums/ItemDefinition.js";
export { MAX_COORD_INTEGER, readEntityOrigin } from "./state/EntityOrigin.js";

// Streaming helpers (live `Player` references; use while parsing).
export { DamageMatrix } from "./convenience/DamageMatrix.js";
export type { DamageEntry } from "./convenience/DamageMatrix.js";
export { EconomyTracker } from "./convenience/EconomyTracker.js";
export type { PlayerRoundEconomy } from "./convenience/EconomyTracker.js";
export { GrenadeTrajectoryTracker } from "./convenience/GrenadeTrajectoryTracker.js";
export type {
  GrenadeTrajectory,
  GrenadeType,
  TrajectoryPoint,
} from "./convenience/GrenadeTrajectoryTracker.js";
