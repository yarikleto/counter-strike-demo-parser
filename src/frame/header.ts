/**
 * DemoHeader — the 1072-byte header at the start of every CS:GO .dem file.
 *
 * Layout (all integers little-endian):
 *   Offset  Size  Field
 *   0       8     magic ("HL2DEMO\0")
 *   8       4     demoProtocol (int32)
 *   12      4     networkProtocol (int32)
 *   16      260   serverName (null-terminated string)
 *   276     260   clientName (null-terminated string)
 *   536     260   mapName (null-terminated string)
 *   796     260   gameDirectory (null-terminated string)
 *   1056    4     playbackTime (float32)
 *   1060    4     playbackTicks (int32)
 *   1064    4     playbackFrames (int32)
 *   1068    4     signonLength (int32)
 *   -----
 *   Total: 1072 bytes
 *
 * The magic value is always "HL2DEMO\0" (8 bytes including the null).
 * If it doesn't match, the file is not a valid Source engine demo.
 */
import type { ByteReader } from "../reader/ByteReader.js";

/** Expected magic bytes at the start of every .dem file (8 bytes including null terminator). */
const DEMO_MAGIC = "HL2DEMO\0";

/** The 7 printable characters of the magic, before the null terminator. */
const DEMO_MAGIC_PREFIX = "HL2DEMO";

/** Fixed byte width of each string field in the header. */
const HEADER_STRING_SIZE = 260;

export interface DemoHeader {
  magic: string;
  demoProtocol: number;
  networkProtocol: number;
  serverName: string;
  clientName: string;
  mapName: string;
  gameDirectory: string;
  playbackTime: number;
  playbackTicks: number;
  playbackFrames: number;
  signonLength: number;
}

/**
 * Parse the demo file header from the current reader position.
 *
 * Reads exactly 1072 bytes. Throws if the magic string is invalid.
 */
export function parseHeader(reader: ByteReader): DemoHeader {
  // Read magic as raw bytes so we can validate the null terminator too.
  // readString would strip the trailing \0, losing information.
  const magicBytes = reader.readBytes(8);
  const magicStr = magicBytes.toString("utf8", 0, 7);

  if (magicStr !== DEMO_MAGIC_PREFIX || magicBytes[7] !== 0x00) {
    throw new Error(
      `Invalid demo file: expected magic "${DEMO_MAGIC_PREFIX}\\0" but got "${magicStr}"`,
    );
  }

  return {
    magic: DEMO_MAGIC,
    demoProtocol: reader.readInt32(),
    networkProtocol: reader.readInt32(),
    serverName: reader.readString(HEADER_STRING_SIZE),
    clientName: reader.readString(HEADER_STRING_SIZE),
    mapName: reader.readString(HEADER_STRING_SIZE),
    gameDirectory: reader.readString(HEADER_STRING_SIZE),
    playbackTime: reader.readFloat32(),
    playbackTicks: reader.readInt32(),
    playbackFrames: reader.readInt32(),
    signonLength: reader.readInt32(),
  };
}
