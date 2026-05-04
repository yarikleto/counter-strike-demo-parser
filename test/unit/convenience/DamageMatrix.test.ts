/**
 * Unit tests for `DamageMatrix` (TASK-065).
 *
 * The matrix is tested by directly calling `attach()` on a minimal fake
 * EventEmitter that mimics the DemoParser event surface. No real DemoParser
 * or .dem fixture files are needed — this keeps the tests fast and focused on
 * the accumulation logic.
 *
 * Key scenarios:
 *   - Accumulation across multiple `player_hurt` events.
 *   - `.get()` and `.getForRound()` return `undefined` for missing pairs.
 *   - Per-round bucketing: hurt after round 0 starts → perRound[0];
 *     after round 1 starts → perRound[1]; pre-warmup → match only.
 *   - `weapons` and `hitGroups` maps accumulate correctly.
 *   - Self-damage (same slot for attacker and victim) is its own entry.
 *   - World-damage (attacker undefined) is silently skipped.
 */

import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { DamageMatrix } from "../../../src/convenience/DamageMatrix.js";
import { HitGroup } from "../../../src/enums/HitGroup.js";
import type { Player } from "../../../src/state/Player.js";
import type { PlayerHurtEvent } from "../../../src/events/enrichers/playerHurt.js";
import type { DemoParser } from "../../../src/DemoParser.js";

// DemoParser is a concrete class with many private members; we only need the
// `.on()` surface for attach(). The cast below is safe because DamageMatrix
// only calls `parser.on(...)` inside attach().
type ParserLike = Pick<DemoParser, "on">;

// ---------------------------------------------------------------------------
// Fake EventEmitter that quacks like the DemoParser event surface used by
// DamageMatrix.attach(). Only `round_start` and `player_hurt` are needed.
// ---------------------------------------------------------------------------

interface FakeParser {
  asParser: ParserLike;
  emitRoundStart(): void;
  emitHurt(e: PlayerHurtEvent): void;
}

function makeFakeParser(): FakeParser {
  const emitter = new EventEmitter();
  return {
    asParser: emitter as unknown as ParserLike,
    emitRoundStart: () => emitter.emit("round_start", {}),
    emitHurt: (e: PlayerHurtEvent) => emitter.emit("player_hurt", e),
  };
}

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

function makePlayer(slot: number): Player {
  return { slot } as unknown as Player;
}

function makeHurt(
  attacker: Player | undefined,
  victim: Player,
  damage = 50,
  damageArmor = 10,
  weapon = "weapon_ak47",
  hitGroup: HitGroup | number = HitGroup.Chest,
): PlayerHurtEvent {
  return Object.freeze({
    eventName: "player_hurt",
    eventId: 4,
    attacker,
    victim,
    weapon,
    damage,
    damageArmor,
    hitGroup,
    healthRemaining: 100 - damage,
    armorRemaining: 100 - damageArmor,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DamageMatrix", () => {
  // ── Basic structure ──────────────────────────────────────────────────────

  it("returns undefined from .get() when no events have been received", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    expect(matrix.get(1, 2)).toBeUndefined();
  });

  it("returns undefined from .getForRound() when no events have been received", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    expect(matrix.getForRound(0, 1, 2)).toBeUndefined();
  });

  it(".entries() yields nothing when no events have been received", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    expect([...matrix.entries()]).toHaveLength(0);
  });

  it(".entriesForRound() yields nothing for an out-of-range index", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    expect([...matrix.entriesForRound(99)]).toHaveLength(0);
  });

  // ── Full-match accumulation ──────────────────────────────────────────────

  it("accumulates damage, armor damage, and hit count", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    fake.emitHurt(makeHurt(p1, p2, 40, 8));
    fake.emitHurt(makeHurt(p1, p2, 60, 12));

    const entry = matrix.get(1, 2);
    expect(entry).toBeDefined();
    expect(entry!.totalDamage).toBe(100);
    expect(entry!.totalArmorDamage).toBe(20);
    expect(entry!.hitCount).toBe(2);
    expect(entry!.attacker.slot).toBe(1);
    expect(entry!.victim.slot).toBe(2);
  });

  it("accumulates the weapons map", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    fake.emitHurt(makeHurt(p1, p2, 50, 0, "weapon_ak47"));
    fake.emitHurt(makeHurt(p1, p2, 50, 0, "weapon_ak47"));
    fake.emitHurt(makeHurt(p1, p2, 50, 0, "weapon_awp"));

    const entry = matrix.get(1, 2)!;
    expect(entry.weapons.get("weapon_ak47")).toBe(2);
    expect(entry.weapons.get("weapon_awp")).toBe(1);
  });

  it("uses 'unknown' as weapon key when weapon string is empty", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    fake.emitHurt(makeHurt(p1, p2, 30, 0, ""));

    const entry = matrix.get(1, 2)!;
    expect(entry.weapons.get("unknown")).toBe(1);
    expect(entry.weapons.has("")).toBe(false);
  });

  it("accumulates the hitGroups map", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    fake.emitHurt(makeHurt(p1, p2, 100, 0, "weapon_awp", HitGroup.Head));
    fake.emitHurt(makeHurt(p1, p2, 30, 0, "weapon_ak47", HitGroup.Chest));
    fake.emitHurt(makeHurt(p1, p2, 25, 0, "weapon_ak47", HitGroup.Chest));

    const entry = matrix.get(1, 2)!;
    expect(entry.hitGroups.get(HitGroup.Head)).toBe(1);
    expect(entry.hitGroups.get(HitGroup.Chest)).toBe(2);
  });

  it("keeps separate entries for (p1→p2) and (p2→p1)", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    fake.emitHurt(makeHurt(p1, p2, 80, 0));
    fake.emitHurt(makeHurt(p2, p1, 30, 0));

    const e12 = matrix.get(1, 2)!;
    const e21 = matrix.get(2, 1)!;
    expect(e12.totalDamage).toBe(80);
    expect(e21.totalDamage).toBe(30);
  });

  it(".entries() yields all match-level entries", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);
    const p2 = makePlayer(2);
    const p3 = makePlayer(3);

    fake.emitHurt(makeHurt(p1, p2));
    fake.emitHurt(makeHurt(p2, p1));
    fake.emitHurt(makeHurt(p1, p3));

    expect([...matrix.entries()]).toHaveLength(3);
  });

  // ── Self-damage ──────────────────────────────────────────────────────────

  it("self-damage (same slot) is stored as its own entry", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(5);

    // e.g. nade bounce, flash self-damage
    fake.emitHurt(makeHurt(p1, p1, 20, 0));

    const selfEntry = matrix.get(5, 5);
    expect(selfEntry).toBeDefined();
    expect(selfEntry!.attacker.slot).toBe(5);
    expect(selfEntry!.victim.slot).toBe(5);
    expect(selfEntry!.totalDamage).toBe(20);
  });

  // ── World damage ─────────────────────────────────────────────────────────

  it("world-damage (attacker undefined) is silently skipped", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);

    fake.emitHurt(makeHurt(undefined, p1, 30, 0));

    expect([...matrix.entries()]).toHaveLength(0);
  });

  // ── Per-round bucketing ──────────────────────────────────────────────────

  it("warmup events go into match map only (currentRoundIdx -1)", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    // No round_start yet — warmup
    fake.emitHurt(makeHurt(p1, p2, 50, 0));

    // Match map has the entry
    expect(matrix.get(1, 2)).toBeDefined();
    // Per-round map for index 0 does not exist yet
    expect(matrix.getForRound(0, 1, 2)).toBeUndefined();
  });

  it("hurt after round 0 starts goes into perRound[0]", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    fake.emitRoundStart(); // round index 0
    fake.emitHurt(makeHurt(p1, p2, 70, 5));

    // Both full-match and round-0 should have the entry
    expect(matrix.get(1, 2)!.totalDamage).toBe(70);
    expect(matrix.getForRound(0, 1, 2)!.totalDamage).toBe(70);
    // Round 1 has nothing
    expect(matrix.getForRound(1, 1, 2)).toBeUndefined();
  });

  it("hurt after round 1 starts goes into perRound[1]", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    fake.emitRoundStart(); // round 0
    fake.emitHurt(makeHurt(p1, p2, 30, 0));

    fake.emitRoundStart(); // round 1
    fake.emitHurt(makeHurt(p1, p2, 50, 0));

    // Round 0 only has the first hurt
    expect(matrix.getForRound(0, 1, 2)!.totalDamage).toBe(30);
    // Round 1 only has the second hurt
    expect(matrix.getForRound(1, 1, 2)!.totalDamage).toBe(50);
    // Full match aggregates both
    expect(matrix.get(1, 2)!.totalDamage).toBe(80);
  });

  it("warmup hurt does not bleed into round buckets", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    // Warmup
    fake.emitHurt(makeHurt(p1, p2, 100, 0));

    // Round 0
    fake.emitRoundStart();
    fake.emitHurt(makeHurt(p1, p2, 20, 0));

    expect(matrix.getForRound(0, 1, 2)!.totalDamage).toBe(20);
    expect(matrix.get(1, 2)!.totalDamage).toBe(120); // warmup + round
  });

  it(".entriesForRound() yields only that round's entries", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);
    const p2 = makePlayer(2);
    const p3 = makePlayer(3);

    fake.emitRoundStart(); // round 0
    fake.emitHurt(makeHurt(p1, p2));
    fake.emitHurt(makeHurt(p1, p3));

    fake.emitRoundStart(); // round 1
    fake.emitHurt(makeHurt(p2, p1));

    expect([...matrix.entriesForRound(0)]).toHaveLength(2);
    expect([...matrix.entriesForRound(1)]).toHaveLength(1);
    expect([...matrix.entriesForRound(2)]).toHaveLength(0);
  });

  // ── HitGroup raw integer forward-compat ──────────────────────────────────

  it("stores raw integer hitgroup values for unknown hitgroups", () => {
    const matrix = new DamageMatrix();
    const fake = makeFakeParser();
    matrix.attach(fake.asParser as DemoParser);

    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    // hitgroup 99 is not in HitGroup enum — forward-compat case
    fake.emitHurt(makeHurt(p1, p2, 50, 0, "weapon_ak47", 99));

    const entry = matrix.get(1, 2)!;
    expect(entry.hitGroups.get(99)).toBe(1);
  });
});
