import { describe, it, expect } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DemoParser } from "../../src/DemoParser.js";

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
    const buffer = Buffer.from([0x01]);
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
      const buffer = Buffer.from([0x01]);
      const parser = DemoParser.parse(buffer);
      expect(parser).toBeInstanceOf(DemoParser);
    });

    it("should throw on empty buffer", () => {
      const buffer = Buffer.alloc(0);
      expect(() => DemoParser.parse(buffer)).toThrow("Empty demo file");
    });
  });
});
