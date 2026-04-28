/**
 * Compression — Snappy decompression for CreateStringTable payloads.
 *
 * When CSVCMsg_CreateStringTable's `flags & STRINGTABLE_FLAG_DATA_COMPRESSED`
 * (bit 0) is set, the `string_data` payload is wrapped in Source's
 * compressed-string-table envelope:
 *
 *   bytes 0..3   — ASCII magic "SNAP" (0x53 0x4E 0x41 0x50)
 *   bytes 4..7   — int32 LE: decompressed length
 *   bytes 8..    — Snappy-compressed body
 *
 * The decompressed body is the same bit-stream the entry parser consumes
 * for uncompressed tables.
 *
 * Snappy runtime: we lazy-load `snappyjs` via a synchronous require() in
 * Node ESM. If the dependency is missing (TASK-024 not yet wired), the
 * function returns `undefined` and the caller gracefully skips the
 * compressed payload — leaving the table registered but empty so the rest
 * of parsing can continue without throwing on garbage bit reads.
 */
import { createRequire } from "node:module";

/** Source's STRINGTABLE_FLAG_DATA_COMPRESSED flag bit. */
export const STRINGTABLE_FLAG_DATA_COMPRESSED = 0x1;

interface SnappyModule {
  uncompress(input: Uint8Array): Uint8Array;
}

let cachedSnappy: SnappyModule | null | undefined;

/**
 * Lazily resolve snappyjs at first use. Caches the module (or `null` if
 * unavailable) so subsequent calls don't re-pay the resolve cost.
 */
function loadSnappy(): SnappyModule | null {
  if (cachedSnappy !== undefined) return cachedSnappy;
  try {
    // Use createRequire so the lookup matches the host's ESM resolution
    // even though we're inside an ES module ourselves.
    const require = createRequire(import.meta.url);
    const mod = require("snappyjs") as SnappyModule | { default: SnappyModule };
    // Some bundlers wrap the export as { default: ... } — handle both.
    cachedSnappy = "default" in mod ? mod.default : mod;
  } catch {
    cachedSnappy = null;
  }
  return cachedSnappy;
}

/**
 * Decompress a Source compressed-string-table payload. Validates the
 * "SNAP" magic and the embedded length. Returns the decompressed bytes,
 * or `undefined` if the payload is too short, the snappy runtime is
 * unavailable, or the magic doesn't match.
 *
 * Throws when the actual decompressed length doesn't match the embedded
 * length — that indicates a malformed demo or a snappy bug we'd rather
 * surface loudly.
 */
export function decompressSnappy(data: Uint8Array): Uint8Array | undefined {
  if (data.length < 8) return undefined;
  if (data[0] !== 0x53 || data[1] !== 0x4e || data[2] !== 0x41 || data[3] !== 0x50) {
    // Bad magic — return undefined so the caller can skip rather than
    // crash. A malformed demo will surface elsewhere.
    return undefined;
  }
  const expectedLength =
    (data[4] | 0) | ((data[5] | 0) << 8) | ((data[6] | 0) << 16) | ((data[7] | 0) << 24);
  const snappy = loadSnappy();
  if (snappy === null) return undefined;
  const compressedBody = data.subarray(8);
  const out = snappy.uncompress(compressedBody);
  if (out.length !== expectedLength) {
    throw new Error(
      `decompressSnappy: decoded length ${out.length} != expected ${expectedLength}`,
    );
  }
  return out;
}
