/**
 * TypedServerInfo — joined, typed view over the demo header and the
 * `CSVCMsg_ServerInfo` packet.
 *
 * The raw protobuf `CSVCMsg_ServerInfo` carries server-side runtime metadata
 * (tickInterval, maxClasses, isHltv, …) but does NOT carry the demo-file-
 * level metadata (mapName as recorded in the header, playbackTime,
 * playbackTicks, demoFile name). Conversely the demo header lacks
 * tickInterval. Consumers who want "everything about this server and demo"
 * have to read both. This module joins them into a single read-only object
 * with a few computed accessors (`tickRate`, `isGOTV`).
 *
 * Per ADR-004: this is a *typed projection*, not a snapshot. The values are
 * sourced from the raw header (frozen post-`parseHeader`) and the raw
 * `CSVCMsg_ServerInfo` (frozen after the single ServerInfo packet decodes —
 * mid-demo server-state changes go through a different mechanism). The
 * parser caches the built `TypedServerInfo` after first access since both
 * source values are immutable post-parseAll.
 */
import type { CSVCMsg_ServerInfo } from "../proto/index.js";
import type { DemoHeader } from "../frame/header.js";

export interface TypedServerInfo {
  /** Map name as reported by the server in CSVCMsg_ServerInfo. */
  readonly mapName: string;
  /** Seconds per tick — the inverse of tickRate. */
  readonly tickInterval: number;
  /** Ticks per second — `1 / tickInterval`. 64 or 128 in practice. */
  readonly tickRate: number;
  /** Number of server classes registered (the dense `classId` upper bound). */
  readonly maxClasses: number;
  /** Server reload generation — increments when the map is reloaded. */
  readonly serverCount: number;
  /** Source network protocol version (~13800+ for modern CS:GO). */
  readonly protocol: number;
  /** Demo-file playback duration in seconds, from the header. */
  readonly playbackTimeSeconds: number;
  /** Demo-file total tick count, from the header. */
  readonly playbackTicks: number;
  /**
   * Demo file name / server name as recorded in the header's `serverName`
   * field. Useful for surfacing "Match record on server X" without forcing
   * consumers to read the raw header.
   */
  readonly demoFile: string;
  /**
   * True when this is a GOTV (HLTV) recording. Sourced from the
   * `CSVCMsg_ServerInfo.isHltv` flag, which the engine sets on the relay
   * server's outgoing demo. Player-perspective ("POV") demos report false.
   */
  readonly isGOTV: boolean;
}

/**
 * Build a `TypedServerInfo` from the raw header and the decoded
 * `CSVCMsg_ServerInfo` packet.
 *
 * Returns `undefined` if `raw` is undefined — i.e., the parser has not yet
 * reached the `CSVCMsg_ServerInfo` packet on the wire (early-read case).
 * The header is required (not nullable) because `parseAll` parses it
 * synchronously before any frame iteration begins, so by the time a
 * `CSVCMsg_ServerInfo` could exist the header always does.
 */
export function buildServerInfo(
  raw: CSVCMsg_ServerInfo | undefined,
  header: DemoHeader,
): TypedServerInfo | undefined {
  if (raw === undefined) return undefined;

  const tickInterval = raw.tickInterval ?? 0;
  // Guard against a zero tickInterval (shouldn't happen on real demos but
  // would produce Infinity here). Surface it as 0 so consumers see an
  // obviously-bad value rather than a sneakily-bad one.
  const tickRate = tickInterval > 0 ? 1 / tickInterval : 0;

  return Object.freeze({
    mapName: raw.mapName ?? "",
    tickInterval,
    tickRate,
    maxClasses: raw.maxClasses ?? 0,
    serverCount: raw.serverCount ?? 0,
    protocol: raw.protocol ?? 0,
    playbackTimeSeconds: header.playbackTime,
    playbackTicks: header.playbackTicks,
    demoFile: header.serverName,
    isGOTV: raw.isHltv ?? false,
  }) as TypedServerInfo;
}
