/**
 * Unit tests for the Int / Int64 property decoders (TASK-019).
 *
 * Exercises the four code paths in `decodeInt`:
 *   - fixed-width signed
 *   - fixed-width unsigned
 *   - varint signed (zigzag)
 *   - varint unsigned
 * plus the same matrix for `decodeInt64` against bigint output.
 */
import { describe, it, expect } from "vitest";
import { BitReader } from "../../../src/reader/BitReader.js";
import { decodeInt, decodeInt64 } from "../../../src/properties/IntDecoder.js";
import {
  SendPropType,
  type SendProp,
  type SendPropTypeValue,
} from "../../../src/datatables/SendTable.js";
import { SPropFlags } from "../../../src/datatables/SPropFlags.js";
import type { FlattenedSendProp } from "../../../src/datatables/ServerClass.js";

function intProp(
  flags: number,
  numBits: number,
  type: SendPropTypeValue = SendPropType.INT,
): FlattenedSendProp {
  const prop: SendProp = {
    type,
    varName: "test",
    flags,
    priority: 0,
    numElements: 0,
    lowValue: 0,
    highValue: 0,
    numBits,
  };
  return { prop, sourceTableName: "DT_Test" };
}

describe("IntDecoder — decodeInt", () => {
  it("reads 8-bit signed values via two's complement", () => {
    const buf = new Uint8Array([0xff, 0x80, 0x7f, 0x00]);
    const reader = new BitReader(buf);
    const p = intProp(0, 8);
    expect(decodeInt(reader, p)).toBe(-1);
    expect(decodeInt(reader, p)).toBe(-128);
    expect(decodeInt(reader, p)).toBe(127);
    expect(decodeInt(reader, p)).toBe(0);
  });

  it("reads 8-bit unsigned values without sign extension", () => {
    const buf = new Uint8Array([0xff, 0x80, 0x7f]);
    const reader = new BitReader(buf);
    const p = intProp(SPropFlags.UNSIGNED, 8);
    expect(decodeInt(reader, p)).toBe(255);
    expect(decodeInt(reader, p)).toBe(128);
    expect(decodeInt(reader, p)).toBe(127);
  });

  it("reads 32-bit unsigned at non-byte-aligned offset", () => {
    // Skip 3 bits, then read a 32-bit value packed into the next 4 bytes
    // shifted up by 3 bits. Constructed: low byte 0xAB, then reading 32
    // bits starting at bit 3 of the buffer should yield a known number.
    // We simply write a known 32-bit value at bit offset 3.
    // Construct: bits [0..2] = 0b101, bits [3..34] = 0xDEADBEEF.
    // 0xDEADBEEF in binary: 1101 1110 1010 1101 1011 1110 1110 1111
    // We need to emit bytes such that BitReader read 3 bits then 32 bits
    // reads back 0b101 then 0xDEADBEEF.
    // Layout (little-endian within byte):
    //   byte0 = (0xDEADBEEF & 0x1F) << 3 | 0b101
    //   subsequent bytes shift the rest of the value down by 3 bits.
    const target = 0xdeadbeef;
    const prefix = 0b101;
    const bits = (BigInt(target) << 3n) | BigInt(prefix);
    const bytes: number[] = [];
    let working = bits;
    for (let i = 0; i < 5; i++) {
      bytes.push(Number(working & 0xffn));
      working >>= 8n;
    }
    const reader = new BitReader(new Uint8Array(bytes));
    expect(reader.readBits(3)).toBe(prefix);
    const p = intProp(SPropFlags.UNSIGNED, 32);
    expect(decodeInt(reader, p)).toBe(target);
  });

  it("reads VARINT unsigned (single-byte values)", () => {
    // Varint 0 = single byte 0x00, varint 1 = 0x01, varint 127 = 0x7F.
    const buf = new Uint8Array([0x00, 0x01, 0x7f]);
    const reader = new BitReader(buf);
    const p = intProp(SPropFlags.VARINT | SPropFlags.UNSIGNED, 32);
    expect(decodeInt(reader, p)).toBe(0);
    expect(decodeInt(reader, p)).toBe(1);
    expect(decodeInt(reader, p)).toBe(127);
  });

  it("reads VARINT signed via zigzag", () => {
    // zigzag: 0 -> 0, 1 -> -1, 2 -> 1, 3 -> -2.
    const buf = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const reader = new BitReader(buf);
    const p = intProp(SPropFlags.VARINT, 32);
    expect(decodeInt(reader, p)).toBe(0);
    expect(decodeInt(reader, p)).toBe(-1);
    expect(decodeInt(reader, p)).toBe(1);
    expect(decodeInt(reader, p)).toBe(-2);
  });

  it("advances the cursor by exactly numBits for fixed-width reads", () => {
    const buf = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const reader = new BitReader(buf);
    const p = intProp(SPropFlags.UNSIGNED, 13);
    decodeInt(reader, p);
    expect(reader.position).toBe(13);
  });
});

describe("IntDecoder — decodeInt64", () => {
  it("reads 64-bit unsigned all-ones", () => {
    const buf = new Uint8Array(8).fill(0xff);
    const reader = new BitReader(buf);
    const p = intProp(SPropFlags.UNSIGNED, 64, SendPropType.INT64);
    expect(decodeInt64(reader, p)).toBe(0xffffffffffffffffn);
  });

  it("reads 64-bit signed -1 via two's complement", () => {
    const buf = new Uint8Array(8).fill(0xff);
    const reader = new BitReader(buf);
    const p = intProp(0, 64, SendPropType.INT64);
    expect(decodeInt64(reader, p)).toBe(-1n);
  });

  it("reads 64-bit signed 0 and 1", () => {
    const buf = new Uint8Array(16);
    buf[8] = 0x01;
    const reader = new BitReader(buf);
    const p = intProp(0, 64, SendPropType.INT64);
    expect(decodeInt64(reader, p)).toBe(0n);
    expect(decodeInt64(reader, p)).toBe(1n);
  });

  it("reads 64-bit signed minimum (sign bit only)", () => {
    // 0x8000_0000_0000_0000 — bit 63 set, all others zero.
    const buf = new Uint8Array(8);
    buf[7] = 0x80;
    const reader = new BitReader(buf);
    const p = intProp(0, 64, SendPropType.INT64);
    expect(decodeInt64(reader, p)).toBe(-(1n << 63n));
  });

  it("reads narrower (≤32-bit) Int64 fixed-width", () => {
    const buf = new Uint8Array([0xff]);
    const reader = new BitReader(buf);
    const p = intProp(SPropFlags.UNSIGNED, 8, SendPropType.INT64);
    expect(decodeInt64(reader, p)).toBe(255n);
  });

  it("reads VARINT64 unsigned (multi-byte)", () => {
    // Encode 300 as a protobuf varint: 0xAC 0x02.
    // 300 = 0b100101100 -> low 7 bits = 0b0101100 = 0x2C with continuation
    // bit set => 0xAC. High 7 bits = 0b00010 = 0x02 (no continuation).
    const buf = new Uint8Array([0xac, 0x02]);
    const reader = new BitReader(buf);
    const p = intProp(
      SPropFlags.VARINT | SPropFlags.UNSIGNED,
      64,
      SendPropType.INT64,
    );
    expect(decodeInt64(reader, p)).toBe(300n);
  });

  it("reads VARINT64 signed via zigzag", () => {
    // zigzag(1) = -1.
    const buf = new Uint8Array([0x01]);
    const reader = new BitReader(buf);
    const p = intProp(SPropFlags.VARINT, 64, SendPropType.INT64);
    expect(decodeInt64(reader, p)).toBe(-1n);
  });
});
