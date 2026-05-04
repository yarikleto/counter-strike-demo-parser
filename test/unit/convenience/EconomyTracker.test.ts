/**
 * Unit tests for `EconomyTracker` (TASK-064).
 *
 * Tests attach the tracker to a minimal fake EventEmitter that mimics the
 * DemoParser event surface. No real DemoParser or .dem fixture files are
 * needed — this keeps the tests fast and focused on the accumulation logic.
 *
 * Key scenarios:
 *   - `getEconomy()` returns undefined before any events.
 *   - startMoney is snapshotted from live players on round_start.
 *   - endMoney is updated from live players on round_end.
 *   - Purchases accumulate onto the correct player/round entry.
 *   - Players joining mid-round (item_purchase with no prior snapshot) get a
 *     best-effort entry created on the first purchase.
 *   - Pre-warmup events (currentIdx === -1) are silently dropped.
 *   - getEconomy returns undefined for an out-of-range round or missing slot.
 *   - Multiple rounds are tracked independently.
 */

import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { EconomyTracker } from "../../../src/convenience/EconomyTracker.js";
import type { Player } from "../../../src/state/Player.js";
import type { ItemPurchaseEvent } from "../../../src/events/enrichers/itemPurchase.js";
import type { DemoParser } from "../../../src/DemoParser.js";

// ---------------------------------------------------------------------------
// Fake parser — only needs .on() + a .players getter.
// ---------------------------------------------------------------------------

interface FakeParser {
  asParser: DemoParser;
  setPlayers(players: Player[]): void;
  emitRoundStart(): void;
  emitPurchase(e: ItemPurchaseEvent): void;
  emitRoundEnd(): void;
}

function makeFakeParser(initialPlayers: Player[] = []): FakeParser {
  const emitter = new EventEmitter();
  let livePlayers = initialPlayers;

  // Build a proxy that satisfies DemoParser's shape for the fields EconomyTracker uses.
  const proxy = new Proxy(emitter, {
    get(target, prop) {
      if (prop === "players") return livePlayers;
      // Delegate everything else (including .on) to the emitter.
      const val = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof val === "function" ? val.bind(target) : val;
    },
  });

  return {
    asParser: proxy as unknown as DemoParser,
    setPlayers(players) {
      livePlayers = players;
    },
    emitRoundStart: () => emitter.emit("round_start", {}),
    emitPurchase: (e) => emitter.emit("item_purchase", e),
    emitRoundEnd: () => emitter.emit("round_end", {}),
  };
}

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

function makePlayer(slot: number, money: number): Player {
  return { slot, money } as unknown as Player;
}

function makePurchase(player: Player, item: string): ItemPurchaseEvent {
  return Object.freeze({
    eventName: "item_purchase",
    eventId: 99,
    player,
    item,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EconomyTracker", () => {
  it("returns undefined from getEconomy() before any events", () => {
    const tracker = new EconomyTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    expect(tracker.getEconomy(0, 1)).toBeUndefined();
  });

  it("returns undefined for an out-of-range roundIdx", () => {
    const tracker = new EconomyTracker();
    const p1 = makePlayer(1, 800);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser);

    fake.emitRoundStart();

    expect(tracker.getEconomy(99, 1)).toBeUndefined();
  });

  it("returns undefined for a missing slot within a valid round", () => {
    const tracker = new EconomyTracker();
    const p1 = makePlayer(1, 800);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser);

    fake.emitRoundStart();

    // Slot 7 was never seen
    expect(tracker.getEconomy(0, 7)).toBeUndefined();
  });

  it("snapshots startMoney from live players on round_start", () => {
    const tracker = new EconomyTracker();
    const p1 = makePlayer(1, 800);
    const p2 = makePlayer(2, 3500);
    const fake = makeFakeParser([p1, p2]);
    tracker.attach(fake.asParser);

    fake.emitRoundStart();

    expect(tracker.getEconomy(0, 1)?.startMoney).toBe(800);
    expect(tracker.getEconomy(0, 2)?.startMoney).toBe(3500);
  });

  it("initialises endMoney to startMoney on round_start", () => {
    const tracker = new EconomyTracker();
    const p1 = makePlayer(1, 1500);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser);

    fake.emitRoundStart();

    const econ = tracker.getEconomy(0, 1)!;
    expect(econ.startMoney).toBe(1500);
    expect(econ.endMoney).toBe(1500);
  });

  it("updates endMoney from live players on round_end", () => {
    const tracker = new EconomyTracker();
    const p1 = makePlayer(1, 1500);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser);

    fake.emitRoundStart();

    // Simulate the player spending money during the round
    fake.setPlayers([makePlayer(1, 200)]);
    fake.emitRoundEnd();

    expect(tracker.getEconomy(0, 1)?.endMoney).toBe(200);
  });

  it("accumulates purchases into the correct round entry", () => {
    const tracker = new EconomyTracker();
    const p1 = makePlayer(1, 4000);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser);

    fake.emitRoundStart();

    const buy1 = makePurchase(p1, "weapon_ak47");
    const buy2 = makePurchase(p1, "item_kevlar");
    fake.emitPurchase(buy1);
    fake.emitPurchase(buy2);

    const econ = tracker.getEconomy(0, 1)!;
    expect(econ.purchases).toHaveLength(2);
    expect(econ.purchases[0]?.item).toBe("weapon_ak47");
    expect(econ.purchases[1]?.item).toBe("item_kevlar");
  });

  it("drops item_purchase events received before any round_start (warmup)", () => {
    const tracker = new EconomyTracker();
    const p1 = makePlayer(1, 800);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser);

    // No round_start fired yet
    fake.emitPurchase(makePurchase(p1, "weapon_glock"));

    // getEconomy for round 0 should still be undefined
    expect(tracker.getEconomy(0, 1)).toBeUndefined();
  });

  it("creates a best-effort entry for a mid-round join (purchase with no snapshot)", () => {
    const tracker = new EconomyTracker();
    // Round starts with no players (player not yet spawned)
    const fake = makeFakeParser([]);
    tracker.attach(fake.asParser);

    fake.emitRoundStart();

    // Player joins mid-round and buys something
    const latecomer = makePlayer(5, 3000);
    fake.emitPurchase(makePurchase(latecomer, "weapon_m4a1"));

    const econ = tracker.getEconomy(0, 5)!;
    expect(econ).toBeDefined();
    expect(econ.startMoney).toBe(3000);
    expect(econ.purchases).toHaveLength(1);
  });

  it("tracks multiple rounds independently", () => {
    const tracker = new EconomyTracker();
    const p1 = makePlayer(1, 800);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser);

    // Round 0
    fake.emitRoundStart();
    fake.emitPurchase(makePurchase(p1, "weapon_glock"));
    fake.setPlayers([makePlayer(1, 300)]);
    fake.emitRoundEnd();

    // Round 1
    fake.setPlayers([makePlayer(1, 2700)]);
    fake.emitRoundStart();
    fake.emitPurchase(makePurchase(p1, "weapon_ak47"));
    fake.setPlayers([makePlayer(1, 0)]);
    fake.emitRoundEnd();

    const r0 = tracker.getEconomy(0, 1)!;
    const r1 = tracker.getEconomy(1, 1)!;

    expect(r0.startMoney).toBe(800);
    expect(r0.endMoney).toBe(300);
    expect(r0.purchases).toHaveLength(1);
    expect(r0.purchases[0]?.item).toBe("weapon_glock");

    expect(r1.startMoney).toBe(2700);
    expect(r1.endMoney).toBe(0);
    expect(r1.purchases).toHaveLength(1);
    expect(r1.purchases[0]?.item).toBe("weapon_ak47");
  });

  it("always returns equipmentValue as 0 (v1.0 stub)", () => {
    const tracker = new EconomyTracker();
    const p1 = makePlayer(1, 1600);
    const fake = makeFakeParser([p1]);
    tracker.attach(fake.asParser);

    fake.emitRoundStart();

    expect(tracker.getEconomy(0, 1)?.equipmentValue).toBe(0);
  });
});
