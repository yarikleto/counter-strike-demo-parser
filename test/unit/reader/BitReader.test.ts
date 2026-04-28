import { describe, it, expect } from "vitest";
import { BitReader } from "../../../src/reader/BitReader.js";

/**
 * Bit ordering note: the first bit read from a byte is the LSB, matching
 * Source's bitbuf. So byte 0b10110001 yields bits 1,0,0,0,1,1,0,1 in order.
 */

describe("BitReader", () => {
  describe("constructor and properties", () => {
    it("should start at bit position 0", () => {
      const reader = new BitReader(new Uint8Array(4));
      expect(reader.position).toBe(0);
    });

    it("should report total bits", () => {
      const reader = new BitReader(new Uint8Array(5));
      expect(reader.length).toBe(40);
    });

    it("should report remaining bits", () => {
      const reader = new BitReader(new Uint8Array(2));
      expect(reader.remaining).toBe(16);
      reader.readBits(5);
      expect(reader.remaining).toBe(11);
    });

    it("should respect byteOffset and byteLength", () => {
      const buf = new Uint8Array([0x00, 0xff, 0xaa, 0x00]);
      const reader = new BitReader(buf, 1, 2);
      expect(reader.length).toBe(16);
      expect(reader.readBits(8)).toBe(0xff);
      expect(reader.readBits(8)).toBe(0xaa);
    });

    it("should throw on invalid range", () => {
      const buf = new Uint8Array(4);
      expect(() => new BitReader(buf, 2, 5)).toThrow(RangeError);
      expect(() => new BitReader(buf, -1)).toThrow(RangeError);
    });
  });

  describe("readBit", () => {
    it("should read bits in LSB-first order", () => {
      // 0b10110001 -> 1,0,0,0,1,1,0,1
      const reader = new BitReader(new Uint8Array([0b10110001]));
      const bits = [];
      for (let i = 0; i < 8; i++) bits.push(reader.readBit());
      expect(bits).toEqual([1, 0, 0, 0, 1, 1, 0, 1]);
    });

    it("should read bits across byte boundaries", () => {
      // bytes: 0b00000001, 0b00000001 -> bit 0 of each is 1
      const reader = new BitReader(new Uint8Array([0x01, 0x01]));
      reader.seek(7);
      expect(reader.readBit()).toBe(0);
      expect(reader.readBit()).toBe(1);
      expect(reader.position).toBe(9);
    });

    it("should throw when reading past end", () => {
      const reader = new BitReader(new Uint8Array(1));
      reader.seek(8);
      expect(() => reader.readBit()).toThrow(RangeError);
    });
  });

  describe("readBits — unsigned", () => {
    it("readBits(0) returns 0 and does not advance", () => {
      const reader = new BitReader(new Uint8Array([0xff]));
      expect(reader.readBits(0)).toBe(0);
      expect(reader.position).toBe(0);
    });

    it("reads 1 bit at offset 0, 3, 7", () => {
      // byte = 0b10001000 -> bits LSB-first: 0,0,0,1,0,0,0,1
      const buf = new Uint8Array([0b10001000]);
      const r0 = new BitReader(buf);
      expect(r0.readBits(1)).toBe(0);
      const r3 = new BitReader(buf);
      r3.seek(3);
      expect(r3.readBits(1)).toBe(1);
      const r7 = new BitReader(buf);
      r7.seek(7);
      expect(r7.readBits(1)).toBe(1);
    });

    it("reads 7 bits at offset 0", () => {
      // 0b01111111 lower 7 bits = 0x7F
      const reader = new BitReader(new Uint8Array([0xff]));
      expect(reader.readBits(7)).toBe(0x7f);
      expect(reader.position).toBe(7);
    });

    it("reads 7 bits at offset 3", () => {
      // bytes: 0xFF, 0xFF — at offset 3, next 7 bits are all 1s
      const reader = new BitReader(new Uint8Array([0xff, 0xff]));
      reader.seek(3);
      expect(reader.readBits(7)).toBe(0x7f);
    });

    it("reads 8 bits aligned (returns full byte)", () => {
      const reader = new BitReader(new Uint8Array([0xab, 0xcd]));
      expect(reader.readBits(8)).toBe(0xab);
      expect(reader.readBits(8)).toBe(0xcd);
    });

    it("reads 8 bits at offset 3 (across boundary)", () => {
      // byte0 = 0xAB = 0b10101011, byte1 = 0xCD = 0b11001101
      // skip 3 bits of byte0, take next 8: top 5 bits of byte0 then low 3 of byte1
      // byte0 >> 3 = 0b00010101 (5 bits), byte1 & 0b111 = 0b101 (3 bits)
      // result = 0b101_10101 = 0b10110101 = 0xB5
      const reader = new BitReader(new Uint8Array([0xab, 0xcd]));
      reader.seek(3);
      expect(reader.readBits(8)).toBe(0xb5);
    });

    it("reads 9 bits at offset 0", () => {
      const reader = new BitReader(new Uint8Array([0xff, 0x01]));
      expect(reader.readBits(9)).toBe(0x1ff);
    });

    it("reads 9 bits at offset 7", () => {
      // first 7 bits skipped, then 9 bits starting at bit 7
      const reader = new BitReader(new Uint8Array([0x80, 0xff, 0x01]));
      reader.seek(7);
      // at bit 7: bit 7 of byte0 = 1, then 8 bits of byte1 = 0xFF
      // result low bit = 1, next 8 bits = 0xFF -> 0b1_11111111 = 0x1FF
      expect(reader.readBits(9)).toBe(0x1ff);
    });

    it("reads 15 bits at offset 0", () => {
      const reader = new BitReader(new Uint8Array([0xff, 0xff]));
      expect(reader.readBits(15)).toBe(0x7fff);
    });

    it("reads 16 bits at offset 0 (LE order)", () => {
      const reader = new BitReader(new Uint8Array([0x34, 0x12]));
      expect(reader.readBits(16)).toBe(0x1234);
    });

    it("reads 16 bits at offset 3", () => {
      const reader = new BitReader(new Uint8Array([0xff, 0xff, 0xff]));
      reader.seek(3);
      expect(reader.readBits(16)).toBe(0xffff);
    });

    it("reads 17 bits at offset 0", () => {
      const reader = new BitReader(new Uint8Array([0xff, 0xff, 0x01]));
      expect(reader.readBits(17)).toBe(0x1ffff);
    });

    it("reads 31 bits at offset 7", () => {
      const reader = new BitReader(
        new Uint8Array([0x80, 0xff, 0xff, 0xff, 0x7f]),
      );
      reader.seek(7);
      expect(reader.readBits(31)).toBe(0x7fffffff);
    });

    it("reads 32 bits = 0xFFFFFFFF at offset 0 (unsigned)", () => {
      const reader = new BitReader(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
      expect(reader.readBits(32)).toBe(0xffffffff);
    });

    it("reads 32 bits = 0xFFFFFFFF at offset 5 (unsigned)", () => {
      // 5 padding bits + 32 ones = 37 bits = needs 5 bytes
      // bits 0..4 anything, bits 5..36 all 1
      // simplest: every byte 0xFF, read 32 starting at bit 5
      const reader = new BitReader(
        new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]),
      );
      reader.seek(5);
      expect(reader.readBits(32)).toBe(0xffffffff);
    });

    it("reads 32 bits at offset 0 with arbitrary value (LE)", () => {
      const reader = new BitReader(
        new Uint8Array([0x78, 0x56, 0x34, 0x12]),
      );
      expect(reader.readBits(32)).toBe(0x12345678);
    });

    it("throws on negative or >32 bit count", () => {
      const reader = new BitReader(new Uint8Array(8));
      expect(() => reader.readBits(-1)).toThrow(RangeError);
      expect(() => reader.readBits(33)).toThrow(RangeError);
    });

    it("throws when reading past end", () => {
      const reader = new BitReader(new Uint8Array(1));
      expect(() => reader.readBits(9)).toThrow(/cannot read 9 bits/);
    });
  });

  describe("readSignedBits", () => {
    it("0xFF as 8-bit signed -> -1", () => {
      const reader = new BitReader(new Uint8Array([0xff]));
      expect(reader.readSignedBits(8)).toBe(-1);
    });

    it("0x80 as 8-bit signed -> -128", () => {
      const reader = new BitReader(new Uint8Array([0x80]));
      expect(reader.readSignedBits(8)).toBe(-128);
    });

    it("0x7F as 8-bit signed -> 127", () => {
      const reader = new BitReader(new Uint8Array([0x7f]));
      expect(reader.readSignedBits(8)).toBe(127);
    });

    it("0x00 as 8-bit signed -> 0", () => {
      const reader = new BitReader(new Uint8Array([0x00]));
      expect(reader.readSignedBits(8)).toBe(0);
    });

    it("32-bit signed sign-extends correctly", () => {
      // 0xFFFFFFFF as signed 32 -> -1
      const reader = new BitReader(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
      expect(reader.readSignedBits(32)).toBe(-1);
    });

    it("32-bit signed positive max", () => {
      const reader = new BitReader(new Uint8Array([0xff, 0xff, 0xff, 0x7f]));
      expect(reader.readSignedBits(32)).toBe(0x7fffffff);
    });

    it("rejects n=0 and n>32", () => {
      const reader = new BitReader(new Uint8Array(4));
      expect(() => reader.readSignedBits(0)).toThrow(RangeError);
      expect(() => reader.readSignedBits(33)).toThrow(RangeError);
    });
  });

  describe("readBytes", () => {
    it("reads bytes when byte-aligned", () => {
      const reader = new BitReader(
        new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]),
      );
      const out = reader.readBytes(3);
      expect(Array.from(out)).toEqual([0x01, 0x02, 0x03]);
      expect(reader.position).toBe(24);
    });

    it("reads bytes at bit offset 1", () => {
      // bytes: 0xFE = 0b11111110, 0xFF = 0b11111111
      // skip bit 0 (=0), then read 8 bits:
      //   low 7 from byte0 >> 1 = 0b1111111
      //   high 1 from byte1 = 1
      //   result = 0b11111111 = 0xFF
      const reader = new BitReader(new Uint8Array([0xfe, 0xff, 0xff]));
      reader.seek(1);
      const out = reader.readBytes(1);
      expect(Array.from(out)).toEqual([0xff]);
    });

    it("reads bytes at bit offset 4", () => {
      // bytes 0xAB, 0xCD, 0xEF
      // 0xAB = 0b10101011, 0xCD = 0b11001101, 0xEF = 0b11101111
      // at offset 4, output byte 0 = (byte0 >> 4) | (byte1 << 4) & 0xff
      //   = 0b00001010 | (0b11010000) = 0b11011010 = 0xDA
      // output byte 1 = (byte1 >> 4) | (byte2 << 4) & 0xff
      //   = 0b00001100 | (0b11110000) = 0b11111100 = 0xFC
      const reader = new BitReader(new Uint8Array([0xab, 0xcd, 0xef]));
      reader.seek(4);
      const out = reader.readBytes(2);
      expect(Array.from(out)).toEqual([0xda, 0xfc]);
    });

    it("reads bytes at bit offset 7", () => {
      // skip 7 bits, then each output byte is (byteN >> 7) | (byteN+1 << 1)
      // bytes: 0x80, 0x80, 0x00 -> at offset 7:
      //   out[0] = (0x80 >> 7) | (0x80 << 1) & 0xff = 1 | 0 = 1
      const reader = new BitReader(new Uint8Array([0x80, 0x80, 0x00]));
      reader.seek(7);
      const out = reader.readBytes(1);
      expect(Array.from(out)).toEqual([0x01]);
    });

    it("readBytes(0) returns empty without advancing", () => {
      const reader = new BitReader(new Uint8Array([0xff]));
      const out = reader.readBytes(0);
      expect(out.length).toBe(0);
      expect(reader.position).toBe(0);
    });

    it("throws on negative n", () => {
      const reader = new BitReader(new Uint8Array(4));
      expect(() => reader.readBytes(-1)).toThrow(RangeError);
    });

    it("throws when reading past end", () => {
      const reader = new BitReader(new Uint8Array(2));
      expect(() => reader.readBytes(3)).toThrow(/cannot read 3 bytes/);
    });
  });

  describe("readUBitVar", () => {
    it("decodes 0 (lookup=0)", () => {
      // ret=0 (6 bits) | lookup=0 (2 bits) -> byte 0x00
      const reader = new BitReader(new Uint8Array([0x00]));
      expect(reader.readUBitVar()).toBe(0);
      expect(reader.position).toBe(8);
    });

    it("decodes 63 (lookup=0)", () => {
      // ret=63=0b111111, lookup=0 -> byte 0b00111111 = 0x3F
      const reader = new BitReader(new Uint8Array([0x3f]));
      expect(reader.readUBitVar()).toBe(63);
    });

    it("decodes 64 (lookup=1)", () => {
      // ret=0, lookup=1, ext=1 (4 bits) -> bytes 0x40, 0x01
      const reader = new BitReader(new Uint8Array([0x40, 0x01]));
      expect(reader.readUBitVar()).toBe(64);
      expect(reader.position).toBe(12);
    });

    it("decodes 1023 (lookup=1, max)", () => {
      // ret=63, lookup=1, ext=15 -> byte0=0b01111111=0x7F, byte1=0x0F
      const reader = new BitReader(new Uint8Array([0x7f, 0x0f]));
      expect(reader.readUBitVar()).toBe(1023);
    });

    it("decodes 1024 (lookup=2)", () => {
      // ret=0, lookup=2, ext=16 -> byte0=0x80, byte1=0x10
      const reader = new BitReader(new Uint8Array([0x80, 0x10]));
      expect(reader.readUBitVar()).toBe(1024);
      expect(reader.position).toBe(16);
    });

    it("decodes 16383 (lookup=2, max)", () => {
      // ret=63, lookup=2, ext=255 -> byte0=0xBF, byte1=0xFF
      const reader = new BitReader(new Uint8Array([0xbf, 0xff]));
      expect(reader.readUBitVar()).toBe(16383);
    });

    it("decodes 16384 (lookup=3)", () => {
      // ret=0, lookup=3, ext=256 (28 bits) -> byte0=0xC0, then ext LE in 28 bits
      // ext=256 = 0x100, low 8 bits = 0x00, next 8 = 0x01, rest 0
      const reader = new BitReader(
        new Uint8Array([0xc0, 0x00, 0x01, 0x00, 0x00]),
      );
      expect(reader.readUBitVar()).toBe(16384);
      expect(reader.position).toBe(36);
    });

    it("decodes large value (lookup=3)", () => {
      // value = 0x12345678, ret = 0x12345678 & 63 = 0x38 = 56
      // ext = 0x12345678 >>> 6 = 0x48D159
      // byte0 = ret(6) | lookup=3(2) = 0b11_111000 = 0xF8
      // ext bytes LE: 0x59, 0xD1, 0x48, 0x00
      const reader = new BitReader(
        new Uint8Array([0xf8, 0x59, 0xd1, 0x48, 0x00]),
      );
      expect(reader.readUBitVar()).toBe(0x12345678);
    });

    it("decodes max uint32 (lookup=3)", () => {
      // value = 0xFFFFFFFF, ret = 63, ext = 0x3FFFFFF (26 bits set, top 2 of 28 zero)
      // byte0 = 0b11_111111 = 0xFF
      // ext LE bytes: 0xFF, 0xFF, 0xFF, 0x03
      const reader = new BitReader(
        new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x03]),
      );
      expect(reader.readUBitVar()).toBe(0xffffffff);
    });

    it("decodes consecutive UBitVars in a stream", () => {
      // [63, 64] -> 0x3F (8 bits) then 0x40,0x01 (12 bits)
      const reader = new BitReader(new Uint8Array([0x3f, 0x40, 0x01]));
      expect(reader.readUBitVar()).toBe(63);
      expect(reader.readUBitVar()).toBe(64);
    });
  });

  describe("seek", () => {
    it("round-trips position then read", () => {
      const reader = new BitReader(new Uint8Array([0xff, 0x00, 0xab]));
      reader.seek(16);
      expect(reader.position).toBe(16);
      expect(reader.readBits(8)).toBe(0xab);
    });

    it("can seek backwards", () => {
      const reader = new BitReader(new Uint8Array([0xab, 0xcd]));
      reader.readBits(16);
      reader.seek(0);
      expect(reader.readBits(8)).toBe(0xab);
    });

    it("can seek to length (end)", () => {
      const reader = new BitReader(new Uint8Array([0xff]));
      reader.seek(8);
      expect(reader.position).toBe(8);
      expect(reader.remaining).toBe(0);
    });

    it("throws on negative seek", () => {
      const reader = new BitReader(new Uint8Array(2));
      expect(() => reader.seek(-1)).toThrow(RangeError);
    });

    it("throws on seek past end", () => {
      const reader = new BitReader(new Uint8Array(2));
      expect(() => reader.seek(17)).toThrow(RangeError);
    });
  });

  describe("readVarInt32 / readSignedVarInt32", () => {
    it("decodes 0", () => {
      const reader = new BitReader(new Uint8Array([0x00]));
      expect(reader.readVarInt32()).toBe(0);
      expect(reader.position).toBe(8);
    });

    it("decodes 1", () => {
      const reader = new BitReader(new Uint8Array([0x01]));
      expect(reader.readVarInt32()).toBe(1);
      expect(reader.position).toBe(8);
    });

    it("decodes 127 (single byte max)", () => {
      const reader = new BitReader(new Uint8Array([0x7f]));
      expect(reader.readVarInt32()).toBe(127);
      expect(reader.position).toBe(8);
    });

    it("decodes 128 (two bytes)", () => {
      // 128 -> 0x80 0x01
      const reader = new BitReader(new Uint8Array([0x80, 0x01]));
      expect(reader.readVarInt32()).toBe(128);
      expect(reader.position).toBe(16);
    });

    it("decodes max int32 2147483647", () => {
      // 0x7FFFFFFF -> 0xFF 0xFF 0xFF 0xFF 0x07
      const reader = new BitReader(
        new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x07]),
      );
      expect(reader.readVarInt32()).toBe(0x7fffffff);
      expect(reader.position).toBe(40);
    });

    it("decodes max uint32 4294967295", () => {
      // 0xFFFFFFFF -> 0xFF 0xFF 0xFF 0xFF 0x0F
      const reader = new BitReader(
        new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x0f]),
      );
      expect(reader.readVarInt32()).toBe(0xffffffff);
    });

    it("decodes varint at non-byte-aligned offset", () => {
      // place varint for value 300 (0xAC, 0x02) starting at bit 3
      // We need to construct bytes such that bits 3..18 = 0xAC | (0x02 << 8) = 0x02AC
      // bits 0..2 = anything (use 0), bits 3..10 = 0xAC, bits 11..18 = 0x02, rest = 0
      // byte0 = (0xAC << 3) & 0xFF = 0x60; carry = 0xAC >> 5 = 0x05
      // byte1 = carry | ((0x02 << 3) & 0xFF) = 0x05 | 0x10 = 0x15
      // carry from byte1 = 0x02 >> 5 = 0
      // byte2 = 0
      const reader = new BitReader(new Uint8Array([0x60, 0x15, 0x00]));
      reader.seek(3);
      expect(reader.readVarInt32()).toBe(300);
    });

    it("zigzag: 0 -> 0", () => {
      const reader = new BitReader(new Uint8Array([0x00]));
      expect(reader.readSignedVarInt32()).toBe(0);
    });

    it("zigzag: 1 -> -1", () => {
      const reader = new BitReader(new Uint8Array([0x01]));
      expect(reader.readSignedVarInt32()).toBe(-1);
    });

    it("zigzag: 2 -> 1", () => {
      const reader = new BitReader(new Uint8Array([0x02]));
      expect(reader.readSignedVarInt32()).toBe(1);
    });

    it("zigzag: 3 -> -2", () => {
      const reader = new BitReader(new Uint8Array([0x03]));
      expect(reader.readSignedVarInt32()).toBe(-2);
    });

    it("zigzag: max int32 2147483647", () => {
      // zigzag-encoded value of 2147483647 is (2147483647 << 1) = 0xFFFFFFFE
      // varint of 0xFFFFFFFE: bytes 0xFE 0xFF 0xFF 0xFF 0x0F
      const reader = new BitReader(
        new Uint8Array([0xfe, 0xff, 0xff, 0xff, 0x0f]),
      );
      expect(reader.readSignedVarInt32()).toBe(0x7fffffff);
    });

    it("zigzag: min int32 -2147483648", () => {
      // zigzag-encoded value of -2147483648 is 0xFFFFFFFF
      // varint of 0xFFFFFFFF: bytes 0xFF 0xFF 0xFF 0xFF 0x0F
      const reader = new BitReader(
        new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x0f]),
      );
      expect(reader.readSignedVarInt32()).toBe(-0x80000000);
    });
  });

  describe("readBitCoord", () => {
    it("returns 0 when both has_int and has_frac are 0", () => {
      // bits 00... -> byte 0x00
      const reader = new BitReader(new Uint8Array([0x00]));
      expect(reader.readBitCoord()).toBe(0);
      expect(reader.position).toBe(2);
    });

    it("decodes 1.5 (int=1, frac=16, sign=0)", () => {
      // has_int=1, has_frac=1, sign=0, int(14)=0 (decodes to 1), frac(5)=16
      // byte0 = bits 0..7 = 1,1,0,0,0,0,0,0 = 0x03
      // byte1 = bits 8..15 = 0
      // byte2 = bits 16..23: bit17..21 = 0,0,0,0,1 -> bit 21 set = 0x20
      const reader = new BitReader(new Uint8Array([0x03, 0x00, 0x20]));
      expect(reader.readBitCoord()).toBe(1.5);
      expect(reader.position).toBe(22);
    });

    it("decodes -1.5 (sign=1)", () => {
      // same as 1.5 but sign bit set -> byte0 = 0x07
      const reader = new BitReader(new Uint8Array([0x07, 0x00, 0x20]));
      expect(reader.readBitCoord()).toBe(-1.5);
    });

    it("decodes 5.25 (int=5, frac=8, sign=0)", () => {
      // has_int=1, has_frac=1, sign=0, int(14)=4, frac(5)=8
      // bit5 set in byte0 -> 0b00100011 = 0x23
      // bit20 set in byte2 -> 0b00010000 = 0x10
      const reader = new BitReader(new Uint8Array([0x23, 0x00, 0x10]));
      expect(reader.readBitCoord()).toBe(5.25);
    });

    it("decodes pure integer (has_frac=0)", () => {
      // has_int=1, has_frac=0, sign=0, int(14)=2 (decodes to 3)
      // bit 0 = has_int = 1
      // bit 1 = has_frac = 0
      // bit 2 = sign = 0
      // bits 3..16 = int = 2 = 0b10 LSB-first -> bit 3=0, bit 4=1, rest 0
      // byte0 = bits 0,1,...7: 1,0,0,0,1,0,0,0 = 0b00010001 = 0x11
      const reader = new BitReader(new Uint8Array([0x11, 0x00, 0x00]));
      expect(reader.readBitCoord()).toBe(3);
      expect(reader.position).toBe(17);
    });

    it("decodes pure fraction (has_int=0)", () => {
      // has_int=0, has_frac=1, sign=0, frac(5)=8 -> 0.25
      // byte0 = bits 0..7: 0,1,0,0,0,0,0,1 = 0b10000010 = 0x82
      // bit 0=0 (has_int), bit 1=1 (has_frac), bit 2=0 (sign),
      // bits 3..7 = frac low 5 bits = 8 = 0b01000 -> bit 3=0, bit4=0, bit5=0, bit6=1, bit7=0
      // result: bit1 + bit6 set = 0b01000010 = 0x42
      const reader = new BitReader(new Uint8Array([0x42]));
      expect(reader.readBitCoord()).toBe(0.25);
    });
  });

  describe("readBitCoordMP", () => {
    it("integral, hasIntVal=0 returns 0", () => {
      const reader = new BitReader(new Uint8Array([0x00]));
      expect(reader.readBitCoordMP(true, false)).toBe(0);
    });

    it("integral, in_bounds=1, hasIntVal=1, int=4 -> 5", () => {
      // bit0=1, bit1=1, bit2=0(sign), bits3..13: int(11)=4 -> bit5 set
      // byte0 = 1,1,0,0,0,1,0,0 = 0b00100011 = 0x23
      const reader = new BitReader(new Uint8Array([0x23, 0x00]));
      expect(reader.readBitCoordMP(true, false)).toBe(5);
    });

    it("integral, in_bounds=0, hasIntVal=1, sign=1, int=0 -> -1", () => {
      // bit0=0(in_bounds), bit1=1(hasIntVal), bit2=1(sign), bits3..16: int(14)=0
      // byte0 = 0,1,1,0,0,0,0,0 = 0b00000110 = 0x06
      const reader = new BitReader(new Uint8Array([0x06, 0x00, 0x00]));
      expect(reader.readBitCoordMP(true, false)).toBe(-1);
    });

    it("non-integral, in_bounds=1, full precision -> 1.5", () => {
      // bit0=1, bit1=1(has_int), bit2=0(sign), bits3..13: int(11)=0,
      // bits 14..18: frac(5)=16 -> bit18 set
      // byte0 = bits 0..7: 1,1,0,0,0,0,0,0 = 0x03
      // byte1 = 0
      // byte2 = bit 16=0, bit17=0, bit18=1, rest=0 = 0b00000100 = 0x04
      const reader = new BitReader(new Uint8Array([0x03, 0x00, 0x04]));
      expect(reader.readBitCoordMP(false, false)).toBe(1.5);
    });

    it("non-integral, in_bounds=0, low precision -> -1.5", () => {
      // bit0=0, bit1=1(has_int), bit2=1(sign), bits3..16: int(14)=0,
      // bits 17..19: frac(3)=4=0b100 -> bit19 set
      // byte0 = bits 0..7: 0,1,1,0,0,0,0,0 = 0x06
      // byte1 = 0
      // byte2 = bit16=0, bit17=0, bit18=0, bit19=1 -> 0b00001000 = 0x08
      const reader = new BitReader(new Uint8Array([0x06, 0x00, 0x08]));
      expect(reader.readBitCoordMP(false, true)).toBe(-1.5);
    });

    it("non-integral, in_bounds=1, has_int=0 -> 0.25", () => {
      // bit0=1, bit1=0(has_int), bit2=0(sign), int skipped,
      // bits 3..7: frac(5)=8=0b01000 -> bit6 set
      // Wait — when has_int=0, intBits are NOT read; frac comes immediately after sign.
      // bit0=1, bit1=0, bit2=0, then frac(5) starts at bit 3
      // frac=8 -> bits 3,4,5,6,7 = 0,0,0,1,0 -> bit6 set
      // byte0 = 1,0,0,0,0,0,1,0 = 0b01000001 = 0x41
      const reader = new BitReader(new Uint8Array([0x41]));
      expect(reader.readBitCoordMP(false, false)).toBe(0.25);
    });
  });

  describe("readBitNormal", () => {
    it("sign=0, fraction=0 -> 0", () => {
      const reader = new BitReader(new Uint8Array([0x00, 0x00]));
      expect(reader.readBitNormal()).toBe(0);
      expect(reader.position).toBe(12);
    });

    it("sign=0, fraction=2047 (max) -> 1", () => {
      // bit0=0(sign), bits 1..11=2047=0b11111111111
      // byte0 bits 0..7: 0,1,1,1,1,1,1,1 -> 0b11111110 = 0xFE
      // byte1 bits 8..11: 1,1,1,1, bits 12..15: 0 -> 0b00001111 = 0x0F
      const reader = new BitReader(new Uint8Array([0xfe, 0x0f]));
      expect(reader.readBitNormal()).toBe(1);
    });

    it("sign=1, fraction=2047 -> -1", () => {
      // bit0=1(sign), bits 1..11 all 1
      // byte0 = 0b11111111 = 0xFF
      // byte1 bits 8..11: all 1 -> 0b00001111 = 0x0F
      const reader = new BitReader(new Uint8Array([0xff, 0x0f]));
      expect(reader.readBitNormal()).toBe(-1);
    });

    it("sign=0, fraction=1023 -> 1023/2047", () => {
      // bit0=0(sign), bits 1..11: fraction=1023=0b01111111111
      // byte0 bits 0..7: 0,1,1,1,1,1,1,1 -> 0xFE
      // byte1 bits 8..10: 1,1,1, bit11=0 -> 0b00000111 = 0x07
      const reader = new BitReader(new Uint8Array([0xfe, 0x07]));
      expect(reader.readBitNormal()).toBeCloseTo(1023 / 2047, 10);
    });
  });

  describe("readBitCellCoord", () => {
    it("integral mode returns just the integer", () => {
      // bits=4, integral=true, raw=10 -> 10
      // 10 = 0b1010, low 4 bits = 0b1010 -> byte0 bits 0..3 = 0,1,0,1 -> 0b1010 = 0x0A
      const reader = new BitReader(new Uint8Array([0x0a]));
      expect(reader.readBitCellCoord(4, true, false)).toBe(10);
      expect(reader.position).toBe(4);
    });

    it("low-precision: int=5, frac=4 -> 5.5", () => {
      // bits=4, int=5=0b0101, frac(3)=4=0b100
      // byte0 bits 0..3: int 5 -> 1,0,1,0 -> 0b0101
      // bits 4..6: frac=4 -> 0,0,1
      // byte0 = 1,0,1,0,0,0,1,0 = 0b01000101 = 0x45
      const reader = new BitReader(new Uint8Array([0x45]));
      expect(reader.readBitCellCoord(4, false, true)).toBe(5.5);
    });

    it("full precision: int=3, frac=8 -> 3.25", () => {
      // bits=4, int=3=0b0011, frac(5)=8=0b01000
      // byte0 bits 0..3: int=3 -> 1,1,0,0
      // bits 4..7: frac low 4 = 8 = 0b1000 -> 0,0,0,1
      // byte1 bit 8: frac high bit = 0
      // byte0 = 1,1,0,0,0,0,0,1 = 0b10000011 = 0x83
      const reader = new BitReader(new Uint8Array([0x83, 0x00]));
      expect(reader.readBitCellCoord(4, false, false)).toBe(3.25);
    });
  });

  describe("readBitFloat", () => {
    it("decodes 1.0", () => {
      // 1.0f = 0x3F800000, LE bytes: 0x00, 0x00, 0x80, 0x3F
      const reader = new BitReader(new Uint8Array([0x00, 0x00, 0x80, 0x3f]));
      expect(reader.readBitFloat()).toBe(1.0);
      expect(reader.position).toBe(32);
    });

    it("decodes 0.0", () => {
      const reader = new BitReader(new Uint8Array([0x00, 0x00, 0x00, 0x00]));
      expect(reader.readBitFloat()).toBe(0);
    });

    it("decodes -2.0", () => {
      // -2.0f = 0xC0000000, LE: 0x00, 0x00, 0x00, 0xC0
      const reader = new BitReader(new Uint8Array([0x00, 0x00, 0x00, 0xc0]));
      expect(reader.readBitFloat()).toBe(-2);
    });

    it("decodes float at non-byte-aligned offset", () => {
      // Place 1.0f starting at bit 4. Need 4 + 32 = 36 bits = 5 bytes.
      // bits 0..3 = 0, bits 4..35 = 0x3F800000 (LE bit order)
      // byte0 = bits 0..7: bits 0..3=0, bits 4..7 = low nibble of byte0 of float = 0
      //   -> 0
      // byte1 = bits 8..15: bits 8..11 = high nibble of float byte 0 = 0,
      //   bits 12..15 = low nibble of float byte 1 = 0 -> 0
      // byte2 = bits 16..23: bits 16..19 = high nibble of float byte 1 = 0,
      //   bits 20..23 = low nibble of float byte 2 = 0 -> 0
      // byte3 = bits 24..31: bits 24..27 = high nibble of float byte 2 = 8 (high),
      //   bits 28..31 = low nibble of float byte 3 = F (low of 0x3F)
      //   high nibble of 0x80 = 8 -> bits 24..27 represent value 8 LSB-first:
      //   bit 24=0, bit 25=0, bit 26=0, bit 27=1
      //   low nibble of 0x3F = F -> bits 28..31 represent value 15 LSB-first
      //   bit 28=1, bit 29=1, bit 30=1, bit 31=1
      //   byte3 = 0b11111000 = 0xF8
      // byte4 = bits 32..39: bits 32..35 = high nibble of float byte 3 = 3
      //   bit 32=1, bit 33=1, bit 34=0, bit 35=0
      //   bits 36..39 = 0
      //   byte4 = 0b00000011 = 0x03
      const reader = new BitReader(
        new Uint8Array([0x00, 0x00, 0x00, 0xf8, 0x03]),
      );
      reader.seek(4);
      expect(reader.readBitFloat()).toBe(1.0);
    });
  });

  describe("readBitAngle", () => {
    it("0 in any bit width -> 0", () => {
      const reader = new BitReader(new Uint8Array([0x00]));
      expect(reader.readBitAngle(8)).toBe(0);
    });

    it("8 bits, raw=128 -> 180 degrees", () => {
      // 128 = 0b10000000 -> LSB-first byte = bit7 set = 0x80
      const reader = new BitReader(new Uint8Array([0x80]));
      expect(reader.readBitAngle(8)).toBe(180);
    });

    it("8 bits, raw=64 -> 90 degrees", () => {
      // 64 = 0b01000000 -> bit6 set = 0x40
      const reader = new BitReader(new Uint8Array([0x40]));
      expect(reader.readBitAngle(8)).toBe(90);
    });

    it("16 bits, raw=32768 -> 180 degrees", () => {
      // 32768 = 0x8000 LE -> bytes 0x00, 0x80
      const reader = new BitReader(new Uint8Array([0x00, 0x80]));
      expect(reader.readBitAngle(16)).toBe(180);
    });

    it("rejects bits outside [1, 32]", () => {
      const reader = new BitReader(new Uint8Array(4));
      expect(() => reader.readBitAngle(0)).toThrow(RangeError);
      expect(() => reader.readBitAngle(33)).toThrow(RangeError);
    });
  });

  describe("readString", () => {
    it("reads empty string (NUL at byte 0)", () => {
      const reader = new BitReader(new Uint8Array([0x00, 0x41]));
      expect(reader.readString()).toBe("");
      // Cursor advanced past the NUL (8 bits).
      expect(reader.position).toBe(8);
    });

    it("reads ASCII 'hello' followed by NUL", () => {
      const bytes = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0xff]);
      const reader = new BitReader(bytes);
      expect(reader.readString()).toBe("hello");
      expect(reader.position).toBe(48); // 6 bytes consumed (5 chars + NUL)
      // Following byte still readable.
      expect(reader.readBits(8)).toBe(0xff);
    });

    it("reads UTF-8 'héllo'", () => {
      // 'h' 0x68, 'é' 0xC3 0xA9, 'l' 'l' 'o', NUL
      const reader = new BitReader(
        new Uint8Array([0x68, 0xc3, 0xa9, 0x6c, 0x6c, 0x6f, 0x00]),
      );
      expect(reader.readString()).toBe("héllo");
    });

    it("respects maxLength when no NUL encountered", () => {
      // Three 'a's, no NUL within first 3 bytes.
      const reader = new BitReader(new Uint8Array([0x61, 0x61, 0x61, 0x00]));
      expect(reader.readString(3)).toBe("aaa");
      expect(reader.position).toBe(24); // exactly 3 bytes consumed, NUL NOT consumed
    });

    it("reads string starting at non-byte-aligned offset", () => {
      // Place "hi\0" starting at bit 3.
      // Source bytes: 'h' 0x68, 'i' 0x69, NUL 0x00 -> place at bit 3
      // We need 3 + 24 = 27 bits = 4 bytes minimum.
      // bits 0..2 = 0; bits 3..26 = 0x00_69_68 (LE byte 0 = 0x68 first)
      // Construct by shifting: each source byte spans two output bytes.
      // byte0 = (0x68 << 3) & 0xFF = 0x40, low 3 bits = 0
      //   -> 0x40
      // byte1 = (0x68 >> 5) | ((0x69 << 3) & 0xFF) = 3 | 0x48 = 0x4B
      // byte2 = (0x69 >> 5) | ((0x00 << 3) & 0xFF) = 3 | 0 = 0x03
      // byte3 = (0x00 >> 5) = 0
      const reader = new BitReader(
        new Uint8Array([0x40, 0x4b, 0x03, 0x00]),
      );
      reader.seek(3);
      expect(reader.readString()).toBe("hi");
      expect(reader.position).toBe(3 + 24); // start + 3 bytes
    });

    it("throws when buffer ends before NUL or maxLength", () => {
      // 3 bytes, no NUL, default maxLength=512 should hit end of buffer.
      const reader = new BitReader(new Uint8Array([0x61, 0x61, 0x61]));
      expect(() => reader.readString()).toThrow(/end of buffer/);
    });

    it("rejects negative maxLength", () => {
      const reader = new BitReader(new Uint8Array([0x00]));
      expect(() => reader.readString(-1)).toThrow(RangeError);
    });

    it("respects custom maxLength when NUL is past it", () => {
      // 'abcdef\0' but maxLength=3 -> returns 'abc' without consuming the NUL
      const bytes = new Uint8Array([0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x00]);
      const reader = new BitReader(bytes);
      expect(reader.readString(3)).toBe("abc");
      expect(reader.position).toBe(24);
    });
  });

  describe("error messages", () => {
    it("readBit error message includes position and total", () => {
      const reader = new BitReader(new Uint8Array(1));
      reader.seek(8);
      expect(() => reader.readBit()).toThrow(/position 8.*total bits: 8/);
    });

    it("readBits error message includes count and position", () => {
      const reader = new BitReader(new Uint8Array(1));
      reader.seek(4);
      expect(() => reader.readBits(8)).toThrow(/8 bits at position 4/);
    });
  });
});
