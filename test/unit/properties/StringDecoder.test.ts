/**
 * Unit tests for the String property decoder (TASK-021).
 *
 * Wire format: 9-bit length prefix, followed by `length` UTF-8 bytes (no
 * NUL terminator).
 */
import { describe, it, expect } from "vitest";
import { BitReader } from "../../../src/reader/BitReader.js";
import { decodeString } from "../../../src/properties/StringDecoder.js";
import {
  SendPropType,
  type SendProp,
} from "../../../src/datatables/SendTable.js";
import type { FlattenedSendProp } from "../../../src/datatables/ServerClass.js";

const stringProp: FlattenedSendProp = {
  prop: {
    type: SendPropType.STRING,
    varName: "test",
    flags: 0,
    priority: 0,
    numElements: 0,
    lowValue: 0,
    highValue: 0,
    numBits: 0,
  } satisfies SendProp,
  sourceTableName: "DT_Test",
};

/**
 * Encode a string into a buffer with the wire format: 9-bit length + bytes.
 * Uses BitReader-compatible bit ordering (LSB-first within each byte).
 */
function encodeStringWire(s: string): Uint8Array {
  const utf8 = new TextEncoder().encode(s);
  const length = utf8.length;
  // We need to emit 9 bits of length, then 8 bits per UTF-8 byte. The
  // trick: place 9 bits at bit 0, then bytes follow at bit 9 (which is
  // bit 1 of byte 1, requiring shift). To keep the test simple, we do
  // the bit-packing manually.
  const totalBits = 9 + length * 8;
  const totalBytes = Math.ceil(totalBits / 8);
  const out = new Uint8Array(totalBytes);
  let cursor = 0;
  // Write 9 bits of length, LSB-first.
  for (let i = 0; i < 9; i++) {
    if ((length >>> i) & 1) {
      out[cursor >>> 3] |= 1 << (cursor & 7);
    }
    cursor++;
  }
  // Write each UTF-8 byte, LSB-first.
  for (const byte of utf8) {
    for (let i = 0; i < 8; i++) {
      if ((byte >>> i) & 1) {
        out[cursor >>> 3] |= 1 << (cursor & 7);
      }
      cursor++;
    }
  }
  return out;
}

describe("StringDecoder", () => {
  it("decodes the empty string", () => {
    const reader = new BitReader(encodeStringWire(""));
    expect(decodeString(reader, stringProp)).toBe("");
  });

  it("decodes a short ASCII string", () => {
    const reader = new BitReader(encodeStringWire("hello"));
    expect(decodeString(reader, stringProp)).toBe("hello");
  });

  it("decodes a UTF-8 string with multi-byte codepoints", () => {
    const reader = new BitReader(encodeStringWire("héllo"));
    expect(decodeString(reader, stringProp)).toBe("héllo");
  });

  it("decodes the maximum 511-byte string", () => {
    const big = "A".repeat(511);
    const reader = new BitReader(encodeStringWire(big));
    expect(decodeString(reader, stringProp)).toBe(big);
  });

  it("advances the cursor by 9 + 8*length bits", () => {
    const reader = new BitReader(encodeStringWire("xyz"));
    decodeString(reader, stringProp);
    expect(reader.position).toBe(9 + 8 * 3);
  });
});
