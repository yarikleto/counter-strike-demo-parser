import { describe, it, expect } from "vitest";
import { ByteReader } from "../../../src/reader/ByteReader.js";
import { parseHeader } from "../../../src/frame/header.js";

/** Total header size: 8 + 4 + 4 + 260*4 + 4 + 4 + 4 + 4 = 1072 */
const HEADER_SIZE = 1072;

/**
 * Build a valid 1072-byte demo header buffer with the given field values.
 * Unspecified fields get sensible defaults.
 */
function buildHeaderBuffer(
  overrides: {
    magic?: string;
    demoProtocol?: number;
    networkProtocol?: number;
    serverName?: string;
    clientName?: string;
    mapName?: string;
    gameDirectory?: string;
    playbackTime?: number;
    playbackTicks?: number;
    playbackFrames?: number;
    signonLength?: number;
  } = {},
): Buffer {
  const buf = Buffer.alloc(HEADER_SIZE);
  let offset = 0;

  const magic = overrides.magic ?? "HL2DEMO\0";
  buf.write(magic, 0, 8, "utf8");
  offset = 8;

  buf.writeInt32LE(overrides.demoProtocol ?? 4, offset);
  offset += 4;
  buf.writeInt32LE(overrides.networkProtocol ?? 13764, offset);
  offset += 4;

  const writeFixedString = (value: string, size: number) => {
    buf.write(value, offset, size, "utf8");
    offset += size;
  };

  writeFixedString(overrides.serverName ?? "Valve CS:GO Server", 260);
  writeFixedString(overrides.clientName ?? "Player One", 260);
  writeFixedString(overrides.mapName ?? "de_dust2", 260);
  writeFixedString(overrides.gameDirectory ?? "csgo", 260);

  buf.writeFloatLE(overrides.playbackTime ?? 2345.67, offset);
  offset += 4;
  buf.writeInt32LE(overrides.playbackTicks ?? 300224, offset);
  offset += 4;
  buf.writeInt32LE(overrides.playbackFrames ?? 150112, offset);
  offset += 4;
  buf.writeInt32LE(overrides.signonLength ?? 524288, offset);

  return buf;
}

describe("parseHeader", () => {
  it("should parse all fields from a valid header buffer", () => {
    const buf = buildHeaderBuffer();
    const header = parseHeader(new ByteReader(buf));

    expect(header.magic).toBe("HL2DEMO\0");
    expect(header.demoProtocol).toBe(4);
    expect(header.networkProtocol).toBe(13764);
    expect(header.serverName).toBe("Valve CS:GO Server");
    expect(header.clientName).toBe("Player One");
    expect(header.mapName).toBe("de_dust2");
    expect(header.gameDirectory).toBe("csgo");
    expect(header.playbackTime).toBeCloseTo(2345.67, 1);
    expect(header.playbackTicks).toBe(300224);
    expect(header.playbackFrames).toBe(150112);
    expect(header.signonLength).toBe(524288);
  });

  it("should advance the reader position by exactly 1072 bytes", () => {
    const buf = Buffer.alloc(HEADER_SIZE + 64);
    buildHeaderBuffer().copy(buf);
    const reader = new ByteReader(buf);
    parseHeader(reader);
    expect(reader.position).toBe(HEADER_SIZE);
  });

  it("should throw on invalid magic string", () => {
    const buf = buildHeaderBuffer({ magic: "NOTADEMO" });
    expect(() => parseHeader(new ByteReader(buf))).toThrow("Invalid demo file");
  });

  it("should throw on a truncated buffer", () => {
    const buf = Buffer.alloc(64);
    buf.write("HL2DEMO\0", 0, 8, "utf8");
    expect(() => parseHeader(new ByteReader(buf))).toThrow(RangeError);
  });

  it("should handle empty string fields", () => {
    const buf = buildHeaderBuffer({
      serverName: "",
      clientName: "",
    });
    const header = parseHeader(new ByteReader(buf));
    expect(header.serverName).toBe("");
    expect(header.clientName).toBe("");
  });

  it("should handle max-length string fields (259 chars + null)", () => {
    const longName = "x".repeat(259);
    const buf = buildHeaderBuffer({ serverName: longName });
    const header = parseHeader(new ByteReader(buf));
    expect(header.serverName).toBe(longName);
  });
});
