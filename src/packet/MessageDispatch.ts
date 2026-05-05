/**
 * MessageDispatch — decodes the protobuf message stream within a packet
 * frame's payload and routes each message to a registered handler by command ID.
 *
 * Each message in the stream is encoded as:
 *   1. varint cmd_id  — identifies the protobuf message type (NETMessages or
 *                       SVCMessages enum value).
 *   2. varint size    — byte length of the protobuf payload that follows.
 *   3. payload bytes  — the ts-proto-decodable message body.
 *
 * Design notes:
 *   - Command IDs are mapped to ts-proto codec objects via a registry. Each
 *     entry binds a `decode(reader|bytes, length)` to a typed handler. The
 *     dispatcher invokes the matching handler with the decoded message.
 *   - Unknown command IDs are NOT fatal. Demos contain forward-compat
 *     messages we don't understand yet — we skip the payload by its prefixed
 *     size and keep going. The raw (commandId, payload) pair is forwarded
 *     to the optional `onUnknownMessage` handler so a higher layer (e.g.
 *     `DemoParser`) can surface a typed event for power users; if no handler
 *     is registered the message is silently skipped. The dispatcher itself
 *     never logs — keeping it pure and free of stderr noise.
 *   - Decoding uses ts-proto's `Type.decode(bytes, length?)` overload. We
 *     pass the raw `Uint8Array` slice; ts-proto wraps it in its own Reader.
 */
import { Buffer } from "node:buffer";
import { ByteReader } from "../reader/ByteReader.js";
import { NETMessages, SVCMessages } from "../generated/netmessages.js";
import {
  CNETMsg_Tick,
  CSVCMsg_CreateStringTable,
  CSVCMsg_GameEvent,
  CSVCMsg_GameEventList,
  CSVCMsg_PacketEntities,
  CSVCMsg_ServerInfo,
  CSVCMsg_UpdateStringTable,
  CSVCMsg_UserMessage,
} from "../proto/index.js";
import type {
  CNETMsg_Tick as CNETMsg_TickType,
  CSVCMsg_CreateStringTable as CSVCMsg_CreateStringTableType,
  CSVCMsg_GameEvent as CSVCMsg_GameEventType,
  CSVCMsg_GameEventList as CSVCMsg_GameEventListType,
  CSVCMsg_PacketEntities as CSVCMsg_PacketEntitiesType,
  CSVCMsg_ServerInfo as CSVCMsg_ServerInfoType,
  CSVCMsg_UpdateStringTable as CSVCMsg_UpdateStringTableType,
  CSVCMsg_UserMessage as CSVCMsg_UserMessageType,
} from "../proto/index.js";

/** Generic decoder shape exposed by every ts-proto codec object. */
interface ProtoDecoder<T> {
  decode(input: Uint8Array, length?: number): T;
}

/** A single protobuf message extracted from a packet payload. */
export interface RawPacketMessage {
  commandType: number;
  payload: Buffer;
}

/**
 * Handlers keyed by command ID. Registered via the `on*` setters; absent
 * keys cause the corresponding payload to be skipped silently.
 *
 * `onUnknownMessage` is the catch-all for command IDs not in the dispatch
 * registry. It is OPTIONAL — when omitted, unknown messages are skipped
 * silently with zero side effects (no logging, no allocations beyond the
 * size-prefixed payload slice the dispatcher already reads). Provide one
 * if you want to surface a typed event for power users (see
 * `DemoParser`'s `unknownMessage` event) or to collect raw bytes for
 * reverse-engineering a new message variant. The dispatcher never decodes
 * the payload — the consumer owns interpretation.
 */
export interface MessageHandlers {
  onServerInfo?: (msg: CSVCMsg_ServerInfoType) => void;
  onNetTick?: (msg: CNETMsg_TickType) => void;
  onCreateStringTable?: (msg: CSVCMsg_CreateStringTableType) => void;
  onUpdateStringTable?: (msg: CSVCMsg_UpdateStringTableType) => void;
  onPacketEntities?: (msg: CSVCMsg_PacketEntitiesType) => void;
  onGameEventList?: (msg: CSVCMsg_GameEventListType) => void;
  onGameEvent?: (msg: CSVCMsg_GameEventType) => void;
  onUserMessage?: (msg: CSVCMsg_UserMessageType) => void;
  onUnknownMessage?: (commandId: number, payload: Uint8Array) => void;
}

/** One row in the dispatch registry: command ID -> codec + handler key. */
interface DispatchEntry<K extends keyof MessageHandlers> {
  decoder: ProtoDecoder<Parameters<NonNullable<MessageHandlers[K]>>[0]>;
  handlerKey: K;
}

/**
 * Iterate raw (cmd, payload) pairs in a packet data blob without decoding.
 *
 * Useful for callers that want full control over which messages to decode.
 * `MessageDispatcher.dispatch` uses this internally.
 */
export function* iterateRawMessages(data: Buffer): Generator<RawPacketMessage> {
  const reader = new ByteReader(data);
  while (reader.position < reader.length) {
    const commandType = reader.readVarInt32();
    const size = reader.readVarInt32();
    const payload = reader.readBytes(size);
    yield { commandType, payload };
  }
}

/**
 * Dispatcher that decodes known messages and routes them to handlers.
 *
 * Construct once, register handlers, then call `dispatch(payload)` for each
 * packet/signon frame's data section. The same dispatcher instance can be
 * reused across many packets.
 */
export class MessageDispatcher {
  private readonly handlers: MessageHandlers;

  /**
   * Static dispatch table — command ID to (decoder, handler key). We type
   * each entry through a generic helper so handler signatures stay aligned
   * with the codec output type at compile time.
   */
  private static readonly registry: ReadonlyMap<number, DispatchEntry<keyof MessageHandlers>> =
    new Map<number, DispatchEntry<keyof MessageHandlers>>([
      [
        SVCMessages.svc_ServerInfo,
        { decoder: CSVCMsg_ServerInfo, handlerKey: "onServerInfo" },
      ],
      [
        NETMessages.net_Tick,
        { decoder: CNETMsg_Tick, handlerKey: "onNetTick" },
      ],
      [
        SVCMessages.svc_CreateStringTable,
        {
          decoder: CSVCMsg_CreateStringTable,
          handlerKey: "onCreateStringTable",
        },
      ],
      [
        SVCMessages.svc_UpdateStringTable,
        {
          decoder: CSVCMsg_UpdateStringTable,
          handlerKey: "onUpdateStringTable",
        },
      ],
      [
        SVCMessages.svc_PacketEntities,
        {
          decoder: CSVCMsg_PacketEntities,
          handlerKey: "onPacketEntities",
        },
      ],
      [
        SVCMessages.svc_GameEventList,
        {
          decoder: CSVCMsg_GameEventList,
          handlerKey: "onGameEventList",
        },
      ],
      [
        SVCMessages.svc_GameEvent,
        {
          decoder: CSVCMsg_GameEvent,
          handlerKey: "onGameEvent",
        },
      ],
      [
        SVCMessages.svc_UserMessage,
        {
          decoder: CSVCMsg_UserMessage,
          handlerKey: "onUserMessage",
        },
      ],
    ]);

  constructor(handlers: MessageHandlers = {}) {
    this.handlers = handlers;
  }

  /** Command IDs this dispatcher knows how to decode. */
  static knownCommandIds(): readonly number[] {
    return Array.from(MessageDispatcher.registry.keys());
  }

  /**
   * Iterate every protobuf message in `data`, decoding known types and
   * invoking the matching handler. Unknown types are skipped (their payload
   * bytes are consumed but not decoded). Returns nothing.
   */
  dispatch(data: Buffer): void {
    for (const { commandType, payload } of iterateRawMessages(data)) {
      // The Uint8Array view shares memory with the Buffer slice — no copy.
      const view = new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
      const entry = MessageDispatcher.registry.get(commandType);
      if (entry === undefined) {
        // Forward-compat / unimplemented message id. The payload bytes have
        // already been consumed from the stream; hand them to the optional
        // unknown-message handler verbatim and continue. No logging here —
        // the dispatcher stays pure; surfacing this to user code is the
        // higher layer's job (see `DemoParser`'s `unknownMessage` event).
        this.handlers.onUnknownMessage?.(commandType, view);
        continue;
      }
      const decoded = entry.decoder.decode(view);
      const handler = this.handlers[entry.handlerKey];
      if (handler !== undefined) {
        // Cast is sound because the registry binds decoder output type to
        // the handler key's parameter type via DispatchEntry<K>.
        (handler as (m: unknown) => void)(decoded);
      }
    }
  }
}
