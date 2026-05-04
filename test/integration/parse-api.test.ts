import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { DemoParser } from "../../src/DemoParser.js";
import type { DemoResult } from "../../src/convenience/DemoResult.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

// TASK-062: end-to-end verification of the `DemoParser.parse()` async API
// against the de_nuke.dem fixture. Covers path input, buffer input,
// `includeRawEvents` opt-in, and missing-file rejection.
describe("DemoParser.parse() — integration on de_nuke.dem", () => {
  it("returns a fully-typed DemoResult when given a file path", async () => {
    const result: DemoResult = await DemoParser.parse(FIXTURE);

    // Header sanity
    expect(result.header.networkProtocol).toBeGreaterThan(0);
    expect(result.header.mapName.length).toBeGreaterThan(0);

    // Kills: at least one death; spot-check the typed victim field
    expect(result.kills.length).toBeGreaterThan(0);
    const sampleKill = result.kills[0];
    expect(sampleKill.victim).toBeDefined();

    // Rounds
    expect(result.rounds.length).toBeGreaterThan(0);

    // Grenades — bots-only demo may have few or many; just assert it is an array
    expect(Array.isArray(result.grenades)).toBe(true);

    // Chat messages — bots-only demo may have zero; just assert it is an array
    expect(Array.isArray(result.chatMessages)).toBe(true);

    // events must be absent by default (opt-in only)
    expect(result.events).toBeUndefined();

    // Players present at dem_stop
    expect(result.players.length).toBeGreaterThan(0);
  });

  it("populates events when includeRawEvents is true", async () => {
    const result = await DemoParser.parse(FIXTURE, { includeRawEvents: true });

    expect(result.events).toBeDefined();
    // Competitive demos carry tens of thousands of game events; use a
    // conservative floor that any real demo will exceed.
    expect(result.events!.length).toBeGreaterThan(1000);
  });

  it("produces identical kills.length when given a Buffer instead of a path", async () => {
    const buffer = readFileSync(FIXTURE);
    const pathResult = await DemoParser.parse(FIXTURE);
    const bufferResult = await DemoParser.parse(buffer);

    expect(bufferResult.kills.length).toBe(pathResult.kills.length);
  });

  it("rejects with an error when the file does not exist", async () => {
    await expect(
      DemoParser.parse("./does-not-exist.dem"),
    ).rejects.toThrow();
  });
});
