import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("DemoParser.serverInfoState — typed overlay on de_nuke.dem", () => {
  it("is undefined before parseAll() runs", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    expect(parser.serverInfoState).toBeUndefined();
  });

  it("populates a typed roll-up after parseAll() completes", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    const state = parser.serverInfoState;
    expect(state).toBeDefined();
    expect(Object.isFrozen(state)).toBe(true);

    // Map name comes from the CSVCMsg_ServerInfo packet, not the header.
    expect(state!.mapName).toBe("de_nuke");

    // de_nuke.dem fixture is 128-tick: tickInterval = 1/128, tickRate = 128.
    expect(state!.tickInterval).toBe(1 / 128);
    expect(state!.tickRate).toBe(128);

    // Matches the existing serverinfo.test assertion (>100). For de_nuke
    // the recorded value is 284 — pin it so a regression in the proto
    // schema or in the assignment is caught.
    expect(state!.maxClasses).toBe(284);

    // Header-sourced fields: playback time is positive on a real demo.
    expect(state!.playbackTimeSeconds).toBeGreaterThan(0);
    expect(state!.playbackTicks).toBeGreaterThan(0);

    // isGOTV is a boolean — exact value depends on the recorder; we only
    // pin the type, not the value.
    expect(typeof state!.isGOTV).toBe("boolean");

    // Protocol > 100 (modern CS:GO is ~13800).
    expect(state!.protocol).toBeGreaterThan(100);
  });

  it("memoizes the built object across repeated reads", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    const a = parser.serverInfoState;
    const b = parser.serverInfoState;
    expect(a).toBeDefined();
    // Reference equality — proves the memoization (per ADR-004 the value
    // is a stable, read-only projection that doesn't change post-parse).
    expect(a).toBe(b);
  });

  it("does not replace the existing raw `serverInfo` getter", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    // Both getters resolve, and they expose different shapes — the raw
    // one carries every protobuf field including ones the typed overlay
    // intentionally hides (e.g., mapCrc).
    expect(parser.serverInfo).toBeDefined();
    expect(parser.serverInfoState).toBeDefined();
    expect(parser.serverInfo!.mapName).toBe(parser.serverInfoState!.mapName);
  });
});
