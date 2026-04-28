import { describe, it, expect } from "vitest";
import { ByteReader } from "../../../src/reader/ByteReader.js";

describe("ByteReader", () => {
  describe("constructor and properties", () => {
    it("should start at position 0", () => {
      const reader = new ByteReader(Buffer.alloc(8));
      expect(reader.position).toBe(0);
    });

    it("should report the buffer length", () => {
      const reader = new ByteReader(Buffer.alloc(42));
      expect(reader.length).toBe(42);
    });

    it("should allow seeking via the position setter", () => {
      const reader = new ByteReader(Buffer.alloc(16));
      reader.position = 8;
      expect(reader.position).toBe(8);
    });
  });

  describe("readInt32", () => {
    it("should read a positive signed 32-bit LE integer", () => {
      const buf = Buffer.alloc(4);
      buf.writeInt32LE(123456, 0);
      const reader = new ByteReader(buf);
      expect(reader.readInt32()).toBe(123456);
      expect(reader.position).toBe(4);
    });

    it("should read a negative signed 32-bit LE integer", () => {
      const buf = Buffer.alloc(4);
      buf.writeInt32LE(-99999, 0);
      const reader = new ByteReader(buf);
      expect(reader.readInt32()).toBe(-99999);
    });

    it("should throw when not enough bytes remain", () => {
      const reader = new ByteReader(Buffer.alloc(3));
      expect(() => reader.readInt32()).toThrow(RangeError);
    });
  });

  describe("readUInt32", () => {
    it("should read an unsigned 32-bit LE integer", () => {
      const buf = Buffer.alloc(4);
      buf.writeUInt32LE(3000000000, 0);
      const reader = new ByteReader(buf);
      expect(reader.readUInt32()).toBe(3000000000);
      expect(reader.position).toBe(4);
    });

    it("should throw when not enough bytes remain", () => {
      const reader = new ByteReader(Buffer.alloc(2));
      expect(() => reader.readUInt32()).toThrow(RangeError);
    });
  });

  describe("readFloat32", () => {
    it("should read a 32-bit LE float", () => {
      const buf = Buffer.alloc(4);
      buf.writeFloatLE(3.14, 0);
      const reader = new ByteReader(buf);
      expect(reader.readFloat32()).toBeCloseTo(3.14, 2);
      expect(reader.position).toBe(4);
    });

    it("should read negative floats correctly", () => {
      const buf = Buffer.alloc(4);
      buf.writeFloatLE(-1.5, 0);
      const reader = new ByteReader(buf);
      expect(reader.readFloat32()).toBeCloseTo(-1.5, 5);
    });

    it("should throw when not enough bytes remain", () => {
      const reader = new ByteReader(Buffer.alloc(1));
      expect(() => reader.readFloat32()).toThrow(RangeError);
    });
  });

  describe("readBytes", () => {
    it("should return the requested byte slice", () => {
      const buf = Buffer.from([0x0a, 0x0b, 0x0c, 0x0d, 0x0e]);
      const reader = new ByteReader(buf);
      const slice = reader.readBytes(3);
      expect(slice).toEqual(Buffer.from([0x0a, 0x0b, 0x0c]));
      expect(reader.position).toBe(3);
    });

    it("should read the full buffer when n equals length", () => {
      const buf = Buffer.from([1, 2, 3]);
      const reader = new ByteReader(buf);
      expect(reader.readBytes(3)).toEqual(buf);
      expect(reader.position).toBe(3);
    });

    it("should throw when requesting more bytes than available", () => {
      const reader = new ByteReader(Buffer.alloc(4));
      expect(() => reader.readBytes(5)).toThrow(RangeError);
    });
  });

  describe("readString", () => {
    it("should read a null-terminated string within a fixed field", () => {
      const buf = Buffer.alloc(16);
      buf.write("hello\0", 0, "utf8");
      const reader = new ByteReader(buf);
      expect(reader.readString(16)).toBe("hello");
      expect(reader.position).toBe(16);
    });

    it("should return the full content when there is no null byte", () => {
      const buf = Buffer.from("ABCDEFGH", "utf8");
      const reader = new ByteReader(buf);
      expect(reader.readString(8)).toBe("ABCDEFGH");
    });

    it("should return an empty string when the first byte is null", () => {
      const buf = Buffer.alloc(8);
      const reader = new ByteReader(buf);
      expect(reader.readString(8)).toBe("");
    });

    it("should throw when the field extends past end of buffer", () => {
      const reader = new ByteReader(Buffer.alloc(4));
      expect(() => reader.readString(8)).toThrow(RangeError);
    });
  });

  describe("sequential reads", () => {
    it("should correctly chain multiple reads", () => {
      const buf = Buffer.alloc(12);
      buf.writeInt32LE(1, 0);
      buf.writeUInt32LE(2, 4);
      buf.writeFloatLE(3.0, 8);

      const reader = new ByteReader(buf);
      expect(reader.readInt32()).toBe(1);
      expect(reader.readUInt32()).toBe(2);
      expect(reader.readFloat32()).toBeCloseTo(3.0, 5);
      expect(reader.position).toBe(12);
    });

    it("should throw when a chained read exceeds the buffer", () => {
      const buf = Buffer.alloc(6);
      const reader = new ByteReader(buf);
      reader.readInt32(); // consumes 4
      expect(() => reader.readInt32()).toThrow(RangeError);
    });
  });

  describe("readUInt8", () => {
    it("should read a single unsigned byte and advance cursor by 1", () => {
      const buf = Buffer.from([0xab, 0xcd]);
      const reader = new ByteReader(buf);
      expect(reader.readUInt8()).toBe(0xab);
      expect(reader.position).toBe(1);
    });

    it("should read 0x00 and 0xff correctly", () => {
      const buf = Buffer.from([0x00, 0xff]);
      const reader = new ByteReader(buf);
      expect(reader.readUInt8()).toBe(0);
      expect(reader.readUInt8()).toBe(255);
    });

    it("should throw when no bytes remain", () => {
      const reader = new ByteReader(Buffer.alloc(0));
      expect(() => reader.readUInt8()).toThrow(RangeError);
    });
  });

  describe("readVarInt32", () => {
    it("should decode a single-byte varint", () => {
      // Value 1 encodes as [0x01]
      const reader = new ByteReader(Buffer.from([0x01]));
      expect(reader.readVarInt32()).toBe(1);
      expect(reader.position).toBe(1);
    });

    it("should decode a multi-byte varint (300)", () => {
      // 300 = 0b100101100 => bytes: 0xAC 0x02
      const reader = new ByteReader(Buffer.from([0xac, 0x02]));
      expect(reader.readVarInt32()).toBe(300);
      expect(reader.position).toBe(2);
    });

    it("should decode maximum 5-byte varint (0xFFFFFFFF)", () => {
      // 2^32 - 1 = 4294967295 encoded as 5-byte varint
      // Each byte: 7 data bits + continuation bit
      // [0xFF, 0xFF, 0xFF, 0xFF, 0x0F]
      const reader = new ByteReader(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x0f]));
      expect(reader.readVarInt32()).toBe(4294967295);
      expect(reader.position).toBe(5);
    });

    it("should decode zero", () => {
      const reader = new ByteReader(Buffer.from([0x00]));
      expect(reader.readVarInt32()).toBe(0);
      expect(reader.position).toBe(1);
    });

    it("should throw on a varint longer than 5 bytes", () => {
      // Six continuation bytes — all have MSB set
      const reader = new ByteReader(Buffer.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x01]));
      expect(() => reader.readVarInt32()).toThrow("varint32 is too long");
    });

    it("should throw when buffer is exhausted mid-varint", () => {
      // Continuation bit set but no next byte
      const reader = new ByteReader(Buffer.from([0x80]));
      expect(() => reader.readVarInt32()).toThrow(RangeError);
    });
  });
});
