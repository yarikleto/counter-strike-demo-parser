/**
 * PacketReader — iterates the varint-delimited protobuf message stream
 * inside dem_signon/dem_packet frames.
 *
 * Each message in the stream is:
 *   1. Command type (varint) — identifies the protobuf message type
 *   2. Size (varint) — byte length of the protobuf payload
 *   3. Payload (size bytes) — raw protobuf-encoded message
 *
 * This module yields (commandType, payload) pairs. The caller decides
 * which message types to decode and which to skip.
 */
import { ByteReader } from "../reader/ByteReader.js";

/** A single protobuf message extracted from a packet data stream. */
export interface PacketMessage {
  commandType: number;
  payload: Buffer;
}

/**
 * Iterate over all protobuf messages in a packet data blob.
 *
 * The blob is the raw bytes from a dem_signon or dem_packet frame's data
 * section. Each call yields the next message until the blob is exhausted.
 */
export function* iteratePacketMessages(data: Buffer): Generator<PacketMessage> {
  const reader = new ByteReader(data);

  while (reader.position < reader.length) {
    const commandType = reader.readVarInt32();
    const size = reader.readVarInt32();
    const payload = reader.readBytes(size);
    yield { commandType, payload };
  }
}
