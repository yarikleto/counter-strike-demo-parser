/**
 * FrameParser — reads sequential frames from a demo file after the header.
 *
 * Each frame has a common 6-byte prefix (command byte, tick int32, player slot
 * byte) followed by command-specific data. The parser handles every command
 * type: skipping payloads for types we don't process yet, extracting packet
 * data blobs for dem_signon/dem_packet, and stopping at dem_stop.
 *
 * Design: the parser is a pull-based iterator — callers call readFrame()
 * in a loop until it returns null (dem_stop reached or EOF). This avoids
 * allocating arrays of frames and keeps memory constant.
 *
 * The 152-byte "command info" block in packet frames contains split-screen
 * view origin/angles data. We skip it for now — future tasks will parse it
 * if needed.
 */
import type { ByteReader } from "../reader/ByteReader.js";
import { DemoCommands } from "./DemoCommands.js";
import type { DemoCommand } from "./DemoCommands.js";

/** Size of the command info block inside dem_signon/dem_packet frames. */
const COMMAND_INFO_SIZE = 152;

/** Common fields present in every frame. */
export interface FrameHeader {
  command: DemoCommand;
  tick: number;
  playerSlot: number;
}

/**
 * Result of reading a single frame.
 *
 * For dem_signon/dem_packet, `packetData` contains the raw protobuf message
 * stream. For all other types, `packetData` is undefined and the payload
 * has been skipped.
 */
export interface Frame extends FrameHeader {
  /** Raw protobuf message stream for packet frames, undefined otherwise. */
  packetData: Buffer | undefined;
}

/**
 * Read frames sequentially from a ByteReader positioned after the header.
 *
 * Yields frames one at a time. Stops when dem_stop is encountered or the
 * reader reaches the end of the buffer.
 */
export function* iterateFrames(reader: ByteReader): Generator<Frame> {
  while (reader.position < reader.length) {
    const frame = readFrame(reader);
    if (frame === null) {
      return;
    }
    yield frame;
  }
}

/**
 * Read a single frame from the reader. Returns null when dem_stop is
 * encountered (parsing should end).
 */
function readFrame(reader: ByteReader): Frame | null {
  const command = reader.readUInt8() as DemoCommand;
  const tick = reader.readInt32();
  const playerSlot = reader.readUInt8();

  switch (command) {
    case DemoCommands.DEM_SIGNON:
    case DemoCommands.DEM_PACKET:
      return readPacketFrame(reader, command, tick, playerSlot);

    case DemoCommands.DEM_SYNCTICK:
      return { command, tick, playerSlot, packetData: undefined };

    case DemoCommands.DEM_CONSOLECMD:
    case DemoCommands.DEM_DATATABLES:
    case DemoCommands.DEM_STRINGTABLES:
      skipLengthPrefixedData(reader);
      return { command, tick, playerSlot, packetData: undefined };

    case DemoCommands.DEM_USERCMD:
      // outgoing sequence (int32) + length-prefixed data
      reader.readInt32();
      skipLengthPrefixedData(reader);
      return { command, tick, playerSlot, packetData: undefined };

    case DemoCommands.DEM_STOP:
      return null;

    case DemoCommands.DEM_CUSTOMDATA:
      // unknown int32 + length-prefixed data
      reader.readInt32();
      skipLengthPrefixedData(reader);
      return { command, tick, playerSlot, packetData: undefined };

    default:
      throw new Error(`FrameParser: unknown command byte ${command}`);
  }
}

/** Read a dem_signon or dem_packet frame, returning the packet data blob. */
function readPacketFrame(
  reader: ByteReader,
  command: DemoCommand,
  tick: number,
  playerSlot: number,
): Frame {
  // Skip command info (view origin/angles for two slots)
  reader.readBytes(COMMAND_INFO_SIZE);
  // Skip sequence in and sequence out
  reader.readInt32();
  reader.readInt32();
  // Read the protobuf message stream
  const dataLength = reader.readInt32();
  const packetData = reader.readBytes(dataLength);
  return { command, tick, playerSlot, packetData };
}

/** Skip a length-prefixed data block (int32 length + data bytes). */
function skipLengthPrefixedData(reader: ByteReader): void {
  const length = reader.readInt32();
  reader.readBytes(length);
}
