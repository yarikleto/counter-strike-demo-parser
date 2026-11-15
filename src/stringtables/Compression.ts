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
 * Snappy runtime: `snappyjs` is a regular dependency, imported statically so
 * the same code path works in Node (ESM and CJS builds) and in bundlers
 * targeting the browser / Web Workers. No `createRequire`, no Node built-ins.
 */
import snappy from "snappyjs";

/** Source's STRINGTABLE_FLAG_DATA_COMPRESSED flag bit. */
export const STRINGTABLE_FLAG_DATA_COMPRESSED = 0x1;

/**
 * Decompress a Source compressed-string-table payload. Validates the
 * "SNAP" magic and the embedded length. Returns the decompressed bytes,
 * or `undefined` if the payload is too short or the magic doesn't match.
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
    data[4] | 0 | ((data[5] | 0) << 8) | ((data[6] | 0) << 16) | ((data[7] | 0) << 24);
  const compressedBody = data.subarray(8);
  const out = snappy.uncompress(compressedBody);
  if (out.length !== expectedLength) {
    throw new Error(`decompressSnappy: decoded length ${out.length} != expected ${expectedLength}`);
  }
  return out;
}
