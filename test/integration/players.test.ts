import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("M3 player overlays — integration on de_nuke.dem", () => {
  it("parser.players returns at least one Player", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    expect(parser.players.length).toBeGreaterThan(0);
  });

  it("Player.team returns a valid team enum", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const player = parser.players[0]!;
    expect([0, 1, 2, 3]).toContain(player.team);
  });

  it("Player.position returns a finite Vector3", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const pos = parser.players[0]!.position;
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
    expect(Number.isFinite(pos.z)).toBe(true);
  });

  it("Player.snapshot is frozen", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const snap = parser.players[0]!.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("parser.weapons returns at least one Weapon", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    expect(parser.weapons.length).toBeGreaterThan(0);
  });

  it("parser.players is memoized (returns same reference)", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    expect(parser.players).toBe(parser.players);
  });
});
