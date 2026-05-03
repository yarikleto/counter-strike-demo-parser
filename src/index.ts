/**
 * counter-strike-demo-parser
 *
 * A TypeScript library for parsing CS:GO .dem files.
 * Streaming event-emitter architecture, fully typed, minimal dependencies.
 *
 * @example
 * ```ts
 * import { DemoParser } from 'counter-strike-demo-parser';
 *
 * const buffer = fs.readFileSync('match.dem');
 * const parser = new DemoParser(buffer);
 * parser.on('serverInfo', (info) => {
 *   console.log(`Map: ${info.mapName}, Tick interval: ${info.tickInterval}`);
 * });
 * parser.parseAll();
 * ```
 */
export { DemoParser } from "./DemoParser.js";
export { ByteReader } from "./reader/ByteReader.js";
export { parseHeader } from "./frame/header.js";
export type { DemoHeader } from "./frame/header.js";
export { DemoCommands } from "./frame/DemoCommands.js";
export type { DemoCommand } from "./frame/DemoCommands.js";
export { iterateFrames } from "./frame/FrameParser.js";
export type { Frame, FrameHeader } from "./frame/FrameParser.js";
export {
  MessageDispatcher,
  iterateRawMessages,
} from "./packet/MessageDispatch.js";
export type {
  MessageHandlers,
  RawPacketMessage,
} from "./packet/MessageDispatch.js";
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
