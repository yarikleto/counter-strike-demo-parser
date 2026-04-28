/**
 * Unit tests for Snappy decompression of CreateStringTable payloads.
 *
 * Verifies the SNAP-prefix detection, length validation, and the
 * graceful-skip path when the input doesn't carry a snappy envelope.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { decompressSnappy } from "../../../src/stringtables/Compression.js";

const require = createRequire(import.meta.url);
const snappy = require("snappyjs") as { compress(buf: Uint8Array): Uint8Array };

/**
 * Wrap a payload in Source's compressed-string-table envelope:
 *   "SNAP" + int32 LE decompressed-length + snappy-compressed body.
 */
function wrapSnap(plainText: string): Uint8Array {
  const payload = new TextEncoder().encode(plainText);
  const compressed = snappy.compress(payload);
  const out = new Uint8Array(8 + compressed.length);
  out[0] = 0x53; // 'S'
  out[1] = 0x4e; // 'N'
  out[2] = 0x41; // 'A'
  out[3] = 0x50; // 'P'
  out[4] = payload.length & 0xff;
  out[5] = (payload.length >>> 8) & 0xff;
  out[6] = (payload.length >>> 16) & 0xff;
  out[7] = (payload.length >>> 24) & 0xff;
  out.set(compressed, 8);
  return out;
}

describe("decompressSnappy", () => {
  it("decompresses a valid SNAP-wrapped payload", () => {
    const plain = "hello world from a CSGO string table — repeat repeat repeat";
    const wrapped = wrapSnap(plain);
    const result = decompressSnappy(wrapped);
    expect(result).toBeDefined();
    expect(new TextDecoder().decode(result!)).toBe(plain);
  });

  it("returns undefined when the input is too short", () => {
    expect(decompressSnappy(new Uint8Array(0))).toBeUndefined();
    expect(decompressSnappy(new Uint8Array([0x53, 0x4e]))).toBeUndefined();
  });

  it("returns undefined when the magic is missing", () => {
    // Random non-SNAP bytes — the caller treats this as "not compressed".
    const bytes = new Uint8Array([0xd6, 0x16, 0x06, 0x37, 0xf7, 0x42, 0x56, 0xf6]);
    expect(decompressSnappy(bytes)).toBeUndefined();
  });

  it("throws when the embedded length doesn't match the decoded length", () => {
    const wrapped = wrapSnap("abcdef");
    // Corrupt the embedded length to claim 99 bytes.
    wrapped[4] = 99;
    wrapped[5] = 0;
    wrapped[6] = 0;
    wrapped[7] = 0;
    expect(() => decompressSnappy(wrapped)).toThrow(/decoded length/);
  });
});
