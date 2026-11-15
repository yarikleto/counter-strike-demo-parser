/**
 * DemoResult is plain data (v0.2): no class instances, no references into
 * the parser, safe for structuredClone / postMessage / IndexedDB / JSON.
 *
 * Also checks the records that only the convenience layer produces against
 * the de_nuke fixture: derived grenade throws, grenade effects, bomb records.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/node.js";
import type { DemoResult } from "../../src/browser.js";
import { fixtureAvailable } from "./_fixture.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

/** Every object reachable from `value` is a plain object, array or typed array. */
function assertPlain(value: unknown, path = "result", seen = new Set<unknown>()): void {
  if (value === null || typeof value !== "object") {
    expect(typeof value, path).not.toBe("function");
    expect(typeof value, path).not.toBe("bigint");
    return;
  }
  if (seen.has(value)) return;
  seen.add(value);
  if (ArrayBuffer.isView(value)) return;
  const proto = Object.getPrototypeOf(value);
  const plain = proto === Object.prototype || proto === Array.prototype || proto === null;
  expect(plain, `${path} has prototype ${proto?.constructor?.name}`).toBe(true);
  for (const [key, child] of Object.entries(value)) assertPlain(child, `${path}.${key}`, seen);
}

describe.skipIf(!fixtureAvailable)("DemoResult plain data (de_nuke)", () => {
  let result: DemoResult;

  beforeAll(async () => {
    result = await DemoParser.parse(FIXTURE, { collectPlayerPositions: true });
  });

  it("contains only plain objects, arrays and typed arrays", () => {
    assertPlain(result);
  });

  it("survives structuredClone unchanged", () => {
    expect(structuredClone(result)).toEqual(result);
  });

  it("survives a JSON round trip (typed-array columns aside)", () => {
    const { positions: _positions, shots: _shots, hits: _hits, ...rest } = result;
    // toEqual treats `undefined` fields like absent ones, as JSON does.
    expect(JSON.parse(JSON.stringify(rest))).toEqual(rest);
  });

  it("has a roster that every PlayerRef points into", () => {
    expect(result.players.length).toBeGreaterThanOrEqual(10);
    result.players.forEach((p, i) => expect(p.index).toBe(i));
    for (const kill of result.kills) {
      expect(result.players[kill.victim.index]!.steamId).toBe(kill.victim.steamId);
    }
    expect(result.tickRate).toBeGreaterThan(0);
  });

  it("derives one grenade throw per trajectory, with thrower and positions", () => {
    expect(result.grenades.length).toBe(result.grenadeTrajectories.length);
    const types = new Set(result.grenades.map((g) => g.type));
    for (const t of ["smoke", "flash", "he"]) expect(types).toContain(t);
    const withThrower = result.grenades.filter((g) => g.thrower !== undefined);
    expect(withThrower.length / result.grenades.length).toBeGreaterThan(0.9);
    for (const g of withThrower) {
      const p = g.position!;
      const t = g.throwerPosition!;
      // The projectile spawns at the thrower's hand: well within 200 units.
      expect(Math.hypot(p.x - t.x, p.y - t.y)).toBeLessThan(200);
    }
  });

  it("pairs smokes and infernos with their end, and positions every effect", () => {
    const smokes = result.grenadeEffects.filter((e) => e.type === "smoke");
    const infernos = result.grenadeEffects.filter((e) => e.type === "inferno");
    const flashes = result.grenadeEffects.filter((e) => e.type === "flash");
    expect(smokes.length).toBeGreaterThan(10);
    expect(flashes.length).toBeGreaterThan(10);
    for (const e of [...smokes, ...infernos]) {
      expect(e.endTick).toBeDefined();
      expect(e.endTick!).toBeGreaterThanOrEqual(e.startTick);
    }
    for (const e of flashes) expect(e.endTick).toBe(e.startTick);
    // A smoke lasts ~18 s; most should end via smokegrenade_expired.
    const tickRate = result.tickRate;
    const fullSmokes = smokes.filter((e) => (e.endTick! - e.startTick) / tickRate > 15);
    expect(fullSmokes.length / smokes.length).toBeGreaterThan(0.5);
    for (const e of result.grenadeEffects) {
      expect(Math.abs(e.position.x) + Math.abs(e.position.y)).toBeGreaterThan(0);
    }
  });

  it("records bomb events with sites and positions", () => {
    const plants = result.bomb.filter((b) => b.type === "planted");
    expect(plants.length).toBeGreaterThan(0);
    for (const p of plants) {
      expect(["A", "B"]).toContain(p.site);
      expect(p.player).toBeDefined();
      expect(p.position).toBeDefined();
    }
    // Defuse / explode happen where the bomb was planted that round.
    for (const round of result.rounds) {
      const plant = round.bombEvents.plants[0];
      for (const end of [...round.bombEvents.defuses, ...round.bombEvents.explosions]) {
        expect(plant).toBeDefined();
        expect(
          Math.hypot(end.position!.x - plant!.position!.x, end.position!.y - plant!.position!.y),
        ).toBeLessThan(100);
        expect(end.site).toBe(plant!.site);
      }
    }
  });

  it("rounds share kill record objects with the top-level kills", () => {
    const all = new Set(result.kills);
    for (const round of result.rounds) for (const k of round.kills) expect(all.has(k)).toBe(true);
  });

  it("keeps a running score per round that ends at the final score", () => {
    // The fixture restarts the match after one round (begin_new_match resets
    // the scoreboard): that round is kept but voided.
    expect(result.rounds.map((r) => r.voided).indexOf(false)).toBe(1);
    const counted = result.rounds.filter((r) => !r.voided);
    expect(counted[counted.length - 1]!.score).toEqual(result.score);
    expect(result.score.ct + result.score.t).toBe(counted.length);
    // Each counted round adds exactly one point (sides swap at halftime, so
    // compare totals).
    counted.forEach((round, i) => {
      expect(round.score!.ct + round.score!.t).toBe(i + 1);
    });
  });
});
