import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import { TeamSide } from "../../src/enums/TeamSide.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("M3 team overlays — integration on de_nuke.dem", () => {
  it("parser.teams returns at least the T and CT sides", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    expect(parser.teams.length).toBeGreaterThanOrEqual(2);
  });

  it("every Team.team is a known TeamSide value (0..3)", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    for (const team of parser.teams) {
      expect([
        TeamSide.Unassigned,
        TeamSide.Spectator,
        TeamSide.T,
        TeamSide.CT,
      ]).toContain(team.team);
    }
  });

  it("every Team.score is a non-negative integer", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    for (const team of parser.teams) {
      expect(Number.isInteger(team.score)).toBe(true);
      expect(team.score).toBeGreaterThanOrEqual(0);
    }
  });

  it("the T-side team has a non-empty name", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const t = parser.teams.find((tm) => tm.team === TeamSide.T);
    expect(t).toBeDefined();
    expect(t!.name.length).toBeGreaterThan(0);
  });

  it("the CT-side team has a non-empty name", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const ct = parser.teams.find((tm) => tm.team === TeamSide.CT);
    expect(ct).toBeDefined();
    expect(ct!.name.length).toBeGreaterThan(0);
  });

  it("at least one playing-side team has a non-zero score (final-state demo)", () => {
    // de_nuke.dem is a fully-played match, so by dem_stop both sides have
    // accumulated round wins. We only require ONE side > 0 so the test
    // doesn't over-constrain the fixture (a 16-0 stomp would still pass).
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const playing = parser.teams.filter(
      (tm) => tm.team === TeamSide.T || tm.team === TeamSide.CT,
    );
    expect(playing.some((tm) => tm.score > 0)).toBe(true);
  });

  it("Team.playerSlots is a frozen number[] for every team", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    for (const team of parser.teams) {
      expect(Array.isArray(team.playerSlots)).toBe(true);
      expect(Object.isFrozen(team.playerSlots)).toBe(true);
      for (const slot of team.playerSlots) {
        expect(typeof slot).toBe("number");
      }
    }
  });

  it("Team.snapshot is frozen", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const snap = parser.teams[0]!.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("parser.teams is memoized (returns same reference)", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    expect(parser.teams).toBe(parser.teams);
  });
});
