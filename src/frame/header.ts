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
  /**
   * 8-byte magic identifier — always `"HL2DEMO\0"` on a valid Source demo.
   * `parseHeader` validates this; consumers see the literal string here for
   * provenance / logging.
   */
  magic: string;
  /**
   * Demo file format protocol — currently `4` for CSGO. A bump signals a
   * file-format break (different field layout, new sections); we don't
   * branch on it today but it's surfaced for forward-compat callers.
   */
  demoProtocol: number;
  /**
   * Source network protocol version active when the demo was recorded.
   * Mirrors `CSVCMsg_ServerInfo.protocol` — useful for distinguishing major
   * CSGO build eras when interpreting wire-level edge cases.
   */
  networkProtocol: number;
  /**
   * Server hostname / record source. Often the recording server's
   * `hostname` cvar; on GOTV recordings carries the relay name. Trimmed at
   * the first null byte from the 260-byte fixed-width field.
   */
  serverName: string;
  /**
   * Recording client's display name. Empty on server-side recordings;
   * populated on POV demos with the recording player's Steam display name.
   */
  clientName: string;
  /**
   * Map shortname as it lived in the recorder's filesystem
   * (e.g. `"de_nuke"`). The server-authoritative value lives on
   * `CSVCMsg_ServerInfo.mapName` and may differ on workshop maps; prefer
   * that one when both are available (see {@link TypedServerInfo}).
   */
  mapName: string;
  /**
   * Game directory at record time (e.g. `"csgo"`). Useful for
   * disambiguating mod content — community mods have differing values.
   */
  gameDirectory: string;
  /**
   * Demo playback duration in seconds. Equal to `playbackTicks * tickInterval`
   * once `tickInterval` is known from `CSVCMsg_ServerInfo`.
   */
  playbackTime: number;
  /**
   * Total number of ticks recorded. Combined with `tickInterval` from
   * `CSVCMsg_ServerInfo` to compute real-time duration; combined with
   * `playbackFrames` to get the average frames-per-tick (typically 1).
   */
  playbackTicks: number;
  /**
   * Total number of demo frames recorded. Each frame carries a single
   * tick worth of network packets, console commands, or string-table
   * snapshots — see {@link DemoCommands}.
   */
  playbackFrames: number;
  /**
   * Length in bytes of the signon section — the prologue carrying
   * `dem_signon` packet frames before the first `dem_packet`. Useful for
   * skipping straight to gameplay frames if a consumer doesn't care about
   * signon-only state (we always parse signon, this is informational).
   */
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
