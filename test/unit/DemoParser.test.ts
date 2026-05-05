import { describe, it, expect } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DemoParser } from "../../src/DemoParser.js";
import { DemoCommands } from "../../src/frame/DemoCommands.js";

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

/**
 * Build a synthetic demo buffer with the standard 1072-byte header followed
 * by an arbitrary number of `dem_consolecmd` frames and a final `dem_stop`.
 * Each command is emitted as: command byte + tick(int32 LE) + playerSlot(u8)
 * + length(int32 LE) + ASCII bytes (verbatim, including any trailing nulls).
 */
function buildConsoleCmdDemoBuffer(
  cmds: ReadonlyArray<{ tick: number; ascii: Buffer }>,
): Buffer {
  const parts: Buffer[] = [];
  const header = Buffer.alloc(HEADER_SIZE);
  header.write("HL2DEMO\0", 0, 8, "utf8");
  parts.push(header);
  for (const { tick, ascii } of cmds) {
    const prefix = Buffer.alloc(6);
    prefix.writeUInt8(DemoCommands.DEM_CONSOLECMD, 0);
    prefix.writeInt32LE(tick, 1);
    prefix.writeUInt8(0, 5);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeInt32LE(ascii.length, 0);
    parts.push(prefix, lenBuf, ascii);
  }
  const stop = Buffer.alloc(6);
  stop.writeUInt8(DemoCommands.DEM_STOP, 0);
  parts.push(stop);
  return Buffer.concat(parts);
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

  describe("static parseSync", () => {
    it("should create and parse in one call", () => {
      const buffer = buildMinimalDemoBuffer();
      const parser = DemoParser.parseSync(buffer);
      expect(parser).toBeInstanceOf(DemoParser);
    });

    it("should throw on empty buffer", () => {
      const buffer = Buffer.alloc(0);
      expect(() => DemoParser.parseSync(buffer)).toThrow("Empty demo file");
    });
  });

  describe("consoleCommand event (TASK-049)", () => {
    it("emits one consoleCommand per dem_consolecmd frame with the decoded ASCII string", () => {
      // Three frames: a plain ASCII command, a null-terminated command, and
      // an empty payload. Verifies happy-path decode, single-trailing-null
      // strip, and zero-length tolerance.
      const buffer = buildConsoleCmdDemoBuffer([
        { tick: 100, ascii: Buffer.from("say hello", "ascii") },
        { tick: 200, ascii: Buffer.from("name Player\0", "ascii") },
        { tick: 300, ascii: Buffer.alloc(0) },
      ]);

      const parser = new DemoParser(buffer);
      const events: Array<{ tick: number; command: string }> = [];
      parser.on("consoleCommand", (e) => {
        events.push({ tick: e.tick, command: e.command });
      });
      parser.parseAll();

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ tick: 100, command: "say hello" });
      // Trailing \0 is stripped — embedders see clean strings.
      expect(events[1]).toEqual({ tick: 200, command: "name Player" });
      expect(events[2]).toEqual({ tick: 300, command: "" });
    });

    it("does not strip more than a single trailing null byte", () => {
      // Two trailing nulls — the decoder strips exactly one. The remaining
      // null is preserved (latin1-encoded as 0x00) so the contract is
      // observable: only the C-string terminator is removed.
      const buffer = buildConsoleCmdDemoBuffer([
        { tick: 50, ascii: Buffer.from("rcon test\0\0", "ascii") },
      ]);

      const parser = new DemoParser(buffer);
      const events: Array<{ tick: number; command: string }> = [];
      parser.on("consoleCommand", (e) => {
        events.push({ tick: e.tick, command: e.command });
      });
      parser.parseAll();

      expect(events).toHaveLength(1);
      expect(events[0].tick).toBe(50);
      expect(events[0].command).toBe("rcon test\0");
    });
  });
});
