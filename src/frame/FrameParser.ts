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
 * stream. For dem_datatables, `dataTablesData` contains the raw blob carrying
 * the stream of svc_SendTable messages followed by a single CSVCMsg_ClassInfo.
 * For dem_consolecmd, `consoleCmdData` contains the raw length-prefixed
 * ASCII payload (the recorded console command, possibly null-terminated —
 * decoding is the consumer's responsibility). For dem_stringtables,
 * `stringTablesData` contains the raw byte-level snapshot blob (decoded by
 * {@link parseStringTableSnapshot} — note this is a `bf_write` byte stream,
 * not a protobuf and not the bit-packed CreateStringTable encoding).
 * For dem_usercmd, `userCmdData` carries the int32 outgoing sequence number
 * paired with the raw length-prefixed command-encoding blob — the wire format
 * is a complex bit-packed structure (movement, view-angle, button bits) whose
 * decode is the consumer's responsibility. For dem_customdata, `customData`
 * carries the int32 type discriminator paired with the raw plugin-defined
 * payload; the engine itself does not specify what types mean — interpretation
 * is up to the recording plugin.
 * For all other types, every payload field is undefined and the corresponding
 * payload has been skipped.
 */
export interface Frame extends FrameHeader {
  /** Raw protobuf message stream for packet frames, undefined otherwise. */
  packetData: Buffer | undefined;
  /** Raw payload of a dem_datatables frame, undefined otherwise. */
  dataTablesData: Buffer | undefined;
  /** Raw ASCII payload of a dem_consolecmd frame, undefined otherwise. */
  consoleCmdData: Buffer | undefined;
  /** Raw byte-level payload of a dem_stringtables snapshot frame, undefined
   * otherwise. Decode with `parseStringTableSnapshot`. */
  stringTablesData: Buffer | undefined;
  /** Outgoing sequence number + raw command-encoding blob for a dem_usercmd
   * frame, undefined otherwise. */
  userCmdData: { sequence: number; data: Buffer } | undefined;
  /** Type discriminator + raw plugin-defined payload for a dem_customdata
   * frame, undefined otherwise. */
  customData: { type: number; data: Buffer } | undefined;
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
      return {
        command,
        tick,
        playerSlot,
        packetData: undefined,
        dataTablesData: undefined,
        consoleCmdData: undefined,
        stringTablesData: undefined,
        userCmdData: undefined,
        customData: undefined,
      };

    case DemoCommands.DEM_DATATABLES: {
      const length = reader.readInt32();
      const dataTablesData = reader.readBytes(length);
      return {
        command,
        tick,
        playerSlot,
        packetData: undefined,
        dataTablesData,
        consoleCmdData: undefined,
        stringTablesData: undefined,
        userCmdData: undefined,
        customData: undefined,
      };
    }

    case DemoCommands.DEM_CONSOLECMD: {
      // Length-prefixed ASCII payload. CSGO sometimes null-terminates the
      // string, sometimes not — decoding is the consumer's responsibility.
      const length = reader.readInt32();
      const consoleCmdData = reader.readBytes(length);
      return {
        command,
        tick,
        playerSlot,
        packetData: undefined,
        dataTablesData: undefined,
        consoleCmdData,
        stringTablesData: undefined,
        userCmdData: undefined,
        customData: undefined,
      };
    }

    case DemoCommands.DEM_STRINGTABLES: {
      // Byte-level snapshot blob (NOT bit-packed, NOT a protobuf — see
      // SnapshotParser for the wire format). The int32 length prefix tells
      // us exactly how many bytes belong to this frame's body; we read them
      // verbatim and let the consumer decode.
      const length = reader.readInt32();
      const stringTablesData = reader.readBytes(length);
      return {
        command,
        tick,
        playerSlot,
        packetData: undefined,
        dataTablesData: undefined,
        consoleCmdData: undefined,
        stringTablesData,
        userCmdData: undefined,
        customData: undefined,
      };
    }

    case DemoCommands.DEM_USERCMD: {
      // Outgoing client sequence (int32) + length-prefixed command blob.
      // We surface both — the consumer pairs the sequence with the bit-
      // packed payload to drive their own usercmd decoder.
      const sequence = reader.readInt32();
      const length = reader.readInt32();
      const data = reader.readBytes(length);
      return {
        command,
        tick,
        playerSlot,
        packetData: undefined,
        dataTablesData: undefined,
        consoleCmdData: undefined,
        stringTablesData: undefined,
        userCmdData: { sequence, data },
        customData: undefined,
      };
    }

    case DemoCommands.DEM_STOP:
      return null;

    case DemoCommands.DEM_CUSTOMDATA: {
      // Plugin-specific int32 type discriminator + length-prefixed payload.
      // The engine doesn't define what types mean — interpretation is up
      // to the recording plugin; we surface both verbatim.
      const type = reader.readInt32();
      const length = reader.readInt32();
      const data = reader.readBytes(length);
      return {
        command,
        tick,
        playerSlot,
        packetData: undefined,
        dataTablesData: undefined,
        consoleCmdData: undefined,
        stringTablesData: undefined,
        userCmdData: undefined,
        customData: { type, data },
      };
    }

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
  return {
    command,
    tick,
    playerSlot,
    packetData,
    dataTablesData: undefined,
    consoleCmdData: undefined,
    stringTablesData: undefined,
    userCmdData: undefined,
    customData: undefined,
  };
}
