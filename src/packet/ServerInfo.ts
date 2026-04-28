/**
 * ServerInfo — decoded CSVCMsg_ServerInfo protobuf message.
 *
 * This is the first critical message sent during signon. It tells us the
 * server's protocol version, max entity classes, tick interval, and map name.
 * The tick interval determines whether the server is 64-tick (0.015625) or
 * 128-tick (0.0078125).
 *
 * For the walking skeleton, we decode only the fields needed to prove the
 * pipeline works end-to-end. The full ts-proto generated decoder (TASK-004)
 * will replace this hand-built decoder.
 *
 * Approach: hand-parse the protobuf wire format using ByteReader for bounds-
 * safe reads. Each field is encoded as a (field_number << 3 | wire_type)
 * varint tag, followed by the field value. Wire types: 0 = varint,
 * 1 = 64-bit, 2 = length-delimited, 5 = 32-bit. Unknown fields are skipped
 * by wire type — this is how protobuf forward compatibility works.
 *
 * Field numbers come from Valve's CSVCMsg_ServerInfo definition in
 * netmessages.proto (csgo-protobufs). We deliberately keep zero protobuf
 * runtime dependencies — TASK-004 will swap this for ts-proto generated code.
 */
import { Buffer } from "node:buffer";
import { ByteReader } from "../reader/ByteReader.js";

/** Command type for CSVCMsg_ServerInfo in the SVC_Messages enum. */
export const SVC_MSG_SERVER_INFO = 8;

export interface ServerInfo {
  protocol: number;
  serverCount: number;
  maxClasses: number;
  mapName: string;
  tickInterval: number;
}

/** Protobuf wire types. */
const WIRE_VARINT = 0;
const WIRE_64BIT = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_32BIT = 5;

/** CSVCMsg_ServerInfo field numbers (from netmessages.proto). */
const FIELD_PROTOCOL = 1;
const FIELD_SERVER_COUNT = 2;
const FIELD_MAX_CLASSES = 12;
const FIELD_TICK_INTERVAL = 14;
const FIELD_MAP_NAME = 16;

/**
 * Decode a CSVCMsg_ServerInfo protobuf payload into a typed ServerInfo object.
 *
 * Reads only the fields we need (protocol, server_count, max_classes,
 * map_name, tick_interval) and skips everything else by wire type.
 */
export function decodeServerInfo(payload: Uint8Array): ServerInfo {
  const result: ServerInfo = {
    protocol: 0,
    serverCount: 0,
    maxClasses: 0,
    mapName: "",
    tickInterval: 0,
  };

  const reader = new ByteReader(Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength));

  while (reader.position < reader.length) {
    const tag = reader.readVarInt32();
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x07;

    switch (fieldNumber) {
      case FIELD_PROTOCOL:
        result.protocol = reader.readVarInt32();
        break;
      case FIELD_SERVER_COUNT:
        result.serverCount = reader.readVarInt32();
        break;
      case FIELD_MAX_CLASSES:
        result.maxClasses = reader.readVarInt32();
        break;
      case FIELD_TICK_INTERVAL:
        result.tickInterval = reader.readFloat32();
        break;
      case FIELD_MAP_NAME: {
        const len = reader.readVarInt32();
        const bytes = reader.readBytes(len);
        result.mapName = bytes.toString("utf8");
        break;
      }
      default:
        skipField(reader, wireType);
        break;
    }
  }

  return result;
}

/** Skip a field by wire type, advancing the reader cursor. */
function skipField(reader: ByteReader, wireType: number): void {
  switch (wireType) {
    case WIRE_VARINT:
      reader.readVarInt32();
      return;
    case WIRE_64BIT:
      reader.readBytes(8);
      return;
    case WIRE_LENGTH_DELIMITED: {
      const len = reader.readVarInt32();
      reader.readBytes(len);
      return;
    }
    case WIRE_32BIT:
      reader.readBytes(4);
      return;
    default:
      throw new Error(`ServerInfo: unknown wire type ${wireType}`);
  }
}
