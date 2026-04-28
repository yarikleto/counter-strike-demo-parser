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
