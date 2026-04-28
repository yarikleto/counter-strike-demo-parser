import { describe, it, expect } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DemoParser } from "../../src/DemoParser.js";

/** Header size: 8 (magic) + 4 + 4 + 260*4 + 4 + 4 + 4 + 4 = 1072 bytes. */
const HEADER_SIZE = 1072;

/**
 * Build a minimal valid demo buffer: a 1072-byte header followed by a
 * dem_stop command byte (7) so that iterateFrames terminates immediately.
 * The header has the correct magic; all other fields are zeroed.
 */
function buildMinimalDemoBuffer(): Buffer {
  // Header + 6 bytes for a dem_stop frame (command=7, tick=0 int32, playerSlot=0)
  const buf = Buffer.alloc(HEADER_SIZE + 6);
  buf.write("HL2DEMO\0", 0, 8, "utf8");
  // dem_stop command byte right after the header
  buf.writeUInt8(7, HEADER_SIZE);
  // tick (int32 LE = 0) at HEADER_SIZE+1..HEADER_SIZE+4 — already zero
  // playerSlot (uint8 = 0) at HEADER_SIZE+5 — already zero
  return buf;
}

describe("DemoParser", () => {
  it("should be constructable with a buffer", () => {
    const buffer = Buffer.from([0x01, 0x02, 0x03]);
    const parser = new DemoParser(buffer);
    expect(parser).toBeInstanceOf(DemoParser);
  });

  it("should throw on empty buffer", () => {
    const buffer = Buffer.alloc(0);
    const parser = new DemoParser(buffer);
    expect(() => parser.parseAll()).toThrow("Empty demo file");
  });

  it("should accept a valid buffer without throwing", () => {
    const buffer = buildMinimalDemoBuffer();
    const parser = new DemoParser(buffer);
    expect(() => parser.parseAll()).not.toThrow();
  });

  describe("static fromBuffer", () => {
    it("should create a parser from a buffer", () => {
      const buffer = Buffer.from([0x01, 0x02]);
      const parser = DemoParser.fromBuffer(buffer);
      expect(parser).toBeInstanceOf(DemoParser);
    });
  });

  describe("static fromFile", () => {
    it("should create a parser from a file path", () => {
      const tmpPath = join(tmpdir(), `demo-parser-test-${Date.now()}.dem`);
      writeFileSync(tmpPath, Buffer.from([0x01, 0x02, 0x03]));
      try {
        const parser = DemoParser.fromFile(tmpPath);
        expect(parser).toBeInstanceOf(DemoParser);
      } finally {
        unlinkSync(tmpPath);
      }
    });
  });

  describe("static parse", () => {
    it("should create and parse in one call", () => {
      const buffer = buildMinimalDemoBuffer();
      const parser = DemoParser.parse(buffer);
      expect(parser).toBeInstanceOf(DemoParser);
    });

    it("should throw on empty buffer", () => {
      const buffer = Buffer.alloc(0);
      expect(() => DemoParser.parse(buffer)).toThrow("Empty demo file");
    });
  });
});
