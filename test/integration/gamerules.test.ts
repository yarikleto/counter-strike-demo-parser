import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import { GameRules } from "../../src/state/GameRules.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("M3 GameRules overlay — integration on de_nuke.dem", () => {
  it("parser.gameRules returns a GameRules overlay after parse", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    expect(parser.gameRules).toBeInstanceOf(GameRules);
  });

  it("roundTime is a non-negative integer", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const gr = parser.gameRules!;
    expect(Number.isInteger(gr.roundTime)).toBe(true);
    expect(gr.roundTime).toBeGreaterThanOrEqual(0);
  });

  it("isWarmup is a boolean", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const gr = parser.gameRules!;
    expect(typeof gr.isWarmup).toBe("boolean");
  });

  it("totalRoundsPlayed is a non-negative integer", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const gr = parser.gameRules!;
    expect(Number.isInteger(gr.totalRoundsPlayed)).toBe(true);
    expect(gr.totalRoundsPlayed).toBeGreaterThanOrEqual(0);
  });

  it("matchStartTime is a finite float", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const gr = parser.gameRules!;
    expect(Number.isFinite(gr.matchStartTime)).toBe(true);
  });

  it("hasMatchStarted is a boolean", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const gr = parser.gameRules!;
    expect(typeof gr.hasMatchStarted).toBe("boolean");
  });

  it("isBombPlanted and isBombDropped are booleans", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const gr = parser.gameRules!;
    expect(typeof gr.isBombPlanted).toBe("boolean");
    expect(typeof gr.isBombDropped).toBe("boolean");
  });

  it("snapshot() is frozen and carries the live values", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const gr = parser.gameRules!;
    const snap = gr.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(snap.roundTime).toBe(gr.roundTime);
    expect(snap.totalRoundsPlayed).toBe(gr.totalRoundsPlayed);
    expect(snap.gamePhase).toBe(gr.gamePhase);
  });

  it("parser.gameRules is memoized (returns same reference)", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    expect(parser.gameRules).toBe(parser.gameRules);
  });
});
