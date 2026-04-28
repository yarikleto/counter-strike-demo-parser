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
export { iteratePacketMessages } from "./packet/PacketReader.js";
export type { PacketMessage } from "./packet/PacketReader.js";
export {
  MessageDispatcher,
  iterateRawMessages,
} from "./packet/MessageDispatch.js";
export type {
  MessageHandlers,
  RawPacketMessage,
} from "./packet/MessageDispatch.js";
export type { CSVCMsg_ServerInfo, CNETMsg_Tick } from "./proto/index.js";
