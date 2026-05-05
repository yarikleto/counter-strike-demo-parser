/**
 * Unit tests for `PositionTracker` (TASK-067).
 *
 * Tests attach the tracker to a minimal fake parser that mimics the
 * DemoParser surface used by the tracker (an `entityUpdated` event source,
 * a mutable `currentTick`, and a `players` getter). No real DemoParser or
 * .dem fixture is needed — these tests focus on the sampling logic.
 *
 * Key scenarios:
 *   - Default sample rate (32 ticks) honoured.
 *   - Custom sample rate honoured.
 *   - Snapshot count ≈ players × sampled tick boundaries.
 *   - Position scalars copy through to the snapshot record.
 *   - `Player` is held by reference (matching EconomyTracker's pattern).
 *   - Non-positive sample rates coerce to 1.
 */

import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { PositionTracker } from "../../../src/convenience/PositionTracker.js";
import type { Player } from "../../../src/state/Player.js";
import type { DemoParser } from "../../../src/DemoParser.js";

// ---------------------------------------------------------------------------
// Fake parser — needs entityUpdated event, currentTick, players.
// ---------------------------------------------------------------------------

interface FakeParser {
  asParser: DemoParser;
  setPlayers(players: Player[]): void;
  setTick(tick: number): void;
  /** Fire one `entityUpdated` event (the tracker only inspects currentTick). */
  fireEntityUpdated(): void;
  /** Convenience: advance to a given tick AND fire one entityUpdated. */
  tickTo(tick: number): void;
}

function makeFakeParser(initialPlayers: Player[] = []): FakeParser {
  const emitter = new EventEmitter();
  let livePlayers = initialPlayers;
  let currentTick = 0;

  const proxy = new Proxy(emitter, {
    get(target, prop) {
      if (prop === "players") return livePlayers;
      if (prop === "currentTick") return currentTick;
      const val = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof val === "function" ? val.bind(target) : val;
    },
  });

  return {
    asParser: proxy as unknown as DemoParser,
    setPlayers(players) {
      livePlayers = players;
    },
    setTick(tick) {
      currentTick = tick;
    },
    fireEntityUpdated() {
      // Payload shape doesn't matter — PositionTracker doesn't read the entity.
      emitter.emit("entityUpdated", {});
    },
    tickTo(tick) {
      currentTick = tick;
      emitter.emit("entityUpdated", {});
    },
  };
}

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

function makePlayer(slot: number, x: number, y: number, z: number): Player {
  return {
    slot,
    position: Object.freeze({ x, y, z }),
  } as unknown as Player;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PositionTracker", () => {
  it("returns an empty snapshot before any events", () => {
    const tracker = new PositionTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    expect(tracker.snapshot()).toEqual([]);
  });

  it("samples at the default 32-tick rate", () => {
    const tracker = new PositionTracker();
    const p1 = makePlayer(1, 100, 200, 300);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser);

    // Fire entityUpdated at every tick from 0..96.
    // Default rate is 32 — so we expect samples at ticks 0, 32, 64, 96.
    for (let t = 0; t <= 96; t++) {
      fake.tickTo(t);
    }

    const snaps = tracker.snapshot();
    expect(snaps.map((s) => s.tick)).toEqual([0, 32, 64, 96]);
  });

  it("samples every tick when sampleRateTicks=1", () => {
    const tracker = new PositionTracker();
    const p1 = makePlayer(1, 0, 0, 0);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser, { sampleRateTicks: 1 });

    for (let t = 0; t < 5; t++) {
      fake.tickTo(t);
    }

    expect(tracker.snapshot().map((s) => s.tick)).toEqual([0, 1, 2, 3, 4]);
  });

  it("coerces non-positive sample rates to 1", () => {
    const tracker = new PositionTracker();
    const p1 = makePlayer(1, 0, 0, 0);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser, { sampleRateTicks: 0 });

    for (let t = 0; t < 3; t++) {
      fake.tickTo(t);
    }

    expect(tracker.snapshot()).toHaveLength(3);
  });

  it("samples once per qualifying tick across multiple entityUpdated events", () => {
    // Real demos fire entityUpdated for every networked entity per tick — the
    // tracker must dedupe to one sample per tick boundary.
    const tracker = new PositionTracker();
    const p1 = makePlayer(1, 0, 0, 0);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser, { sampleRateTicks: 10 });

    fake.setTick(10);
    fake.fireEntityUpdated();
    fake.fireEntityUpdated();
    fake.fireEntityUpdated();
    fake.fireEntityUpdated();

    expect(tracker.snapshot()).toHaveLength(1);
  });

  it("captures one snapshot per live player per sampled tick", () => {
    const tracker = new PositionTracker();
    const p1 = makePlayer(1, 1, 1, 1);
    const p2 = makePlayer(2, 2, 2, 2);
    const p3 = makePlayer(3, 3, 3, 3);
    const fake = makeFakeParser([p1, p2, p3]);
    tracker.attach(fake.asParser, { sampleRateTicks: 5 });

    // Sample at ticks 0, 5, 10 — three ticks × three players.
    fake.tickTo(0);
    fake.tickTo(5);
    fake.tickTo(10);

    expect(tracker.snapshot()).toHaveLength(9);
  });

  it("copies x/y/z scalars from the player's position into the snapshot", () => {
    const tracker = new PositionTracker();
    const p1 = makePlayer(1, 100, -200, 64);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser, { sampleRateTicks: 1 });

    fake.tickTo(7);

    const snaps = tracker.snapshot();
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({
      tick: 7,
      x: 100,
      y: -200,
      z: 64,
    });
  });

  it("holds the Player by reference (no snapshot/clone)", () => {
    const tracker = new PositionTracker();
    const p1 = makePlayer(1, 0, 0, 0);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser, { sampleRateTicks: 1 });

    fake.tickTo(0);

    const snap = tracker.snapshot()[0]!;
    expect(snap.player).toBe(p1);
  });

  it("reflects mid-stream player roster changes (joins / leaves)", () => {
    // The tracker reads parser.players lazily on each sample, so a player
    // joining or leaving between ticks shows up in the next sample only.
    const tracker = new PositionTracker();
    const p1 = makePlayer(1, 0, 0, 0);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser, { sampleRateTicks: 5 });

    fake.tickTo(0); // sample with 1 player
    const p2 = makePlayer(2, 9, 9, 9);
    fake.setPlayers([p1, p2]);
    fake.tickTo(5); // sample with 2 players

    expect(tracker.snapshot()).toHaveLength(3);
    // Last sample includes both players.
    const lastTickSamples = tracker.snapshot().filter((s) => s.tick === 5);
    expect(lastTickSamples.map((s) => s.player.slot).sort()).toEqual([1, 2]);
  });

  it("fires the very first sample on the first qualifying tick (regardless of value)", () => {
    // Demos don't always start at tick 0 — verify the lastSampledTick=-Infinity
    // sentinel triggers a sample on the first observed tick.
    const tracker = new PositionTracker();
    const p1 = makePlayer(1, 0, 0, 0);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser, { sampleRateTicks: 32 });

    fake.tickTo(1000); // first event at a high tick value

    expect(tracker.snapshot()).toHaveLength(1);
    expect(tracker.snapshot()[0]?.tick).toBe(1000);
  });
});
