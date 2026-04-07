import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ByteReader } from "../../src/reader/ByteReader.js";
import { parseHeader } from "../../src/frame/header.js";

const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("header — integration with real demo file", () => {
  it("should parse the header from de_nuke.dem", () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const reader = new ByteReader(buffer);
    const header = parseHeader(reader);

    expect(header.magic).toBe("HL2DEMO\0");
    expect(header.mapName).toContain("de_nuke");
    expect(header.playbackTicks).toBeGreaterThan(0);
    expect(header.playbackTime).toBeGreaterThan(0);
    expect(header.demoProtocol).toBeGreaterThan(0);
    expect(header.networkProtocol).toBeGreaterThan(0);
    expect(header.gameDirectory).toBe("csgo");
    expect(header.playbackFrames).toBeGreaterThan(0);
    expect(header.signonLength).toBeGreaterThan(0);
  });

  it("should leave the reader positioned at byte 1072 after parsing", () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const reader = new ByteReader(buffer);
    parseHeader(reader);
    expect(reader.position).toBe(1072);
  });
});
