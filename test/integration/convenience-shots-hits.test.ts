/**
 * Integration test for the columnar `DemoResult.shots` / `DemoResult.hits`
 * and the `tick` on raw game events, against the de_nuke fixture:
 *   - one shot per resolved `weapon_fire`, one hit per resolved `player_hurt`
 *   - columns are right-sized and transferable
 *   - shot positions agree with the sampled player positions
 *   - every gun hit follows a shot by the same attacker a few ticks earlier
 *   - hits add up to the full-match `damage` records
 *   - raw events carry non-decreasing frame ticks that line up with shots
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/node.js";
import { NO_PLAYER, ShotFlags, ShotKind, hitBuffers, shotBuffers } from "../../src/browser.js";
import type { DemoResult } from "../../src/browser.js";
import { fixtureAvailable } from "./_fixture.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe.skipIf(!fixtureAvailable)("shots and hits (de_nuke)", () => {
  let result: DemoResult;
  let weaponFire = 0;
  let playerHurt = 0;

  beforeAll(async () => {
    result = await DemoParser.parse(FIXTURE, {
      collectPlayerPositions: true,
      positionSampleRateTicks: 1,
      includeRawEvents: true,
    });
    // Enriched counts: events whose players resolved.
    const counter = DemoParser.fromFile(FIXTURE);
    counter.on("weapon_fire", () => weaponFire++);
    counter.on("player_hurt", () => playerHurt++);
    counter.parseAll();
  });

  it("records one shot per weapon_fire and one hit per player_hurt", () => {
    expect(weaponFire).toBeGreaterThan(3000);
    expect(result.shots.length).toBe(weaponFire);
    expect(result.hits.length).toBe(playerHurt);
    expect(result.hits.length).toBeGreaterThan(500);
  });

  it("has right-sized, independently transferable columns", () => {
    const { shots, hits } = result;
    const sb = shotBuffers(shots);
    const hb = hitBuffers(hits);
    expect(new Set([...sb, ...hb]).size).toBe(sb.length + hb.length);
    for (const c of [shots.tick, shots.player, shots.x, shots.yaw, shots.weapon, shots.flags]) {
      expect(c.length).toBe(shots.length);
      expect(c.byteLength).toBe(c.buffer.byteLength);
    }
    for (const c of [hits.tick, hits.attacker, hits.victim, hits.damage, hits.victimZ]) {
      expect(c.length).toBe(hits.length);
      expect(c.byteLength).toBe(c.buffer.byteLength);
    }
  });

  it("holds plausible shot values", () => {
    const { shots, players } = result;
    const kinds = new Map<number, number>();
    for (let i = 0; i < shots.length; i++) {
      if (i > 0) expect(shots.tick[i]!).toBeGreaterThanOrEqual(shots.tick[i - 1]!);
      expect(shots.player[i]!).toBeLessThan(players.length);
      const weapon = shots.weapons[shots.weapon[i]!]!;
      expect(weapon.startsWith("weapon_")).toBe(false);
      const silenced = (shots.flags[i]! & ShotFlags.Silenced) !== 0;
      if (silenced) expect(["m4a1_silencer", "usp_silencer"]).toContain(weapon);
      kinds.set(shots.kind[i]!, (kinds.get(shots.kind[i]!) ?? 0) + 1);
    }
    expect(kinds.get(ShotKind.Bullet)! / shots.length).toBeGreaterThan(0.8);
    expect(kinds.get(ShotKind.Knife)).toBeGreaterThan(0);
    expect(kinds.get(ShotKind.Grenade)).toBeGreaterThan(0);
    expect(shots.weapons).toContain("ak47");
    expect(shots.weapons).toContain("knife");
  });

  it("places each shot where the shooter was sampled that tick", () => {
    const { shots, positions } = result;
    const pos = positions!;
    // Index the per-tick samples by (tick, player).
    const at = new Map<string, number>();
    for (let i = 0; i < pos.length; i++) at.set(`${pos.tick[i]}|${pos.player[i]}`, i);
    let found = 0;
    let close = 0;
    for (let i = 0; i < shots.length; i++) {
      const j = at.get(`${shots.tick[i]}|${shots.player[i]}`);
      if (j === undefined) continue;
      found++;
      const d = Math.hypot(shots.x[i]! - pos.x[j]!, shots.y[i]! - pos.y[j]!);
      if (d < 32) close++;
    }
    expect(found / shots.length).toBeGreaterThan(0.95);
    expect(close / found).toBeGreaterThan(0.99);
  });

  it("follows every gun hit with a shot by the same attacker a few ticks earlier", () => {
    const { shots, hits } = result;
    // Ticks of each player's bullet shots, in order.
    const byPlayer = new Map<number, number[]>();
    for (let i = 0; i < shots.length; i++) {
      if (shots.kind[i] !== ShotKind.Bullet) continue;
      const list = byPlayer.get(shots.player[i]!) ?? [];
      list.push(shots.tick[i]!);
      byPlayer.set(shots.player[i]!, list);
    }
    const window = Math.ceil(result.tickRate / 4); // 250 ms
    let guns = 0;
    let matched = 0;
    for (let i = 0; i < hits.length; i++) {
      const weapon = hits.weapons[hits.weapon[i]!]!;
      if (["hegrenade", "inferno", "molotov", "knife", "", "world"].includes(weapon)) continue;
      if (hits.attacker[i] === NO_PLAYER) continue;
      guns++;
      const ticks = byPlayer.get(hits.attacker[i]!) ?? [];
      const t = hits.tick[i]!;
      if (ticks.some((s) => s <= t && s >= t - window)) matched++;
    }
    expect(guns).toBeGreaterThan(500);
    expect(matched / guns).toBeGreaterThan(0.98);
  });

  it("adds up to the full-match damage records", () => {
    const { hits, damage } = result;
    const totals = new Map<string, number>();
    for (let i = 0; i < hits.length; i++) {
      if (hits.attacker[i] === NO_PLAYER) continue;
      const key = `${hits.attacker[i]}|${hits.victim[i]}`;
      totals.set(key, (totals.get(key) ?? 0) + hits.damage[i]!);
    }
    expect(totals.size).toBe(damage.length);
    for (const d of damage) {
      expect(totals.get(`${d.attacker.index}|${d.victim.index}`)).toBe(d.totalDamage);
    }
  });

  it("gives world damage no attacker and NaN attacker coordinates", () => {
    const { hits } = result;
    for (let i = 0; i < hits.length; i++) {
      const none = hits.attacker[i] === NO_PLAYER;
      expect(Number.isNaN(hits.attackerX[i]!)).toBe(none);
      expect(Number.isFinite(hits.victimX[i]!)).toBe(true);
      expect(hits.health[i]!).toBeLessThanOrEqual(100);
    }
  });

  it("stamps raw events with non-decreasing frame ticks that match the shots", () => {
    const events = result.events!;
    expect(events.length).toBeGreaterThan(1000);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.tick).toBeGreaterThanOrEqual(events[i - 1]!.tick);
    }
    const fireTicks = events.filter((e) => e.name === "weapon_fire").map((e) => e.tick);
    expect(fireTicks).toEqual([...result.shots.tick]);
  });
});
