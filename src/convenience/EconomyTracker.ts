/**
 * EconomyTracker — captures per-player, per-round economy snapshots.
 *
 * Attaches to a `DemoParser` before `parseAll()` and records:
 *   - `startMoney` — the player's cash at `round_start`.
 *   - `endMoney`   — the player's cash at `round_end`.
 *   - `purchases`  — all `item_purchase` events for that player/round.
 *   - `equipmentValue` — always 0 in v1.0 (no weapon→cost table yet).
 *
 * Why `round_start` for the start snapshot (not `round_freeze_end`):
 *   At `round_start` the engine has already credited round-start income
 *   (loss bonus, win bonus, starting pistol, etc.). The buy menu opens
 *   during freeze time which begins at or just after `round_start`, so
 *   capturing here gives "money available to spend this round" — the
 *   figure a user would expect to see in the buy menu.
 *
 * Round boundaries come from {@link RoundBuckets}, the same rules as
 * `DemoResult.rounds` and `DamageMatrix`: `round_start` / `begin_new_match`
 * open a round (and take the start-money snapshot), `round_end` takes the
 * end-money snapshot and commits it. Purchases between rounds are dropped.
 * A player joining mid-round (an `item_purchase` with no snapshot for that
 * player) gets a best-effort entry with `startMoney: e.player.money` at the
 * time of purchase. A round whose start was never recorded has no
 * start-money snapshots.
 *
 * Round indexing: 0-based, matching `DemoResult.rounds` and
 * `DamageMatrix` round indexes.
 */

import type { DemoParser } from "../DemoParser.js";
import type { Player } from "../state/Player.js";
import type { ItemPurchaseEvent } from "../events/enrichers/itemPurchase.js";
import { RoundBuckets } from "./RoundBuckets.js";

/**
 * Economy record for a single player in a single round.
 *
 * `equipmentValue` is deferred — we don't have a weapon→cost table.
 * Use `startMoney - endMoney` as a rough approximation for net spend;
 * note that this includes loss-bonus / win-bonus differences between rounds.
 */
export interface PlayerRoundEconomy {
  /** Live `Player` reference as of the round-start snapshot. */
  readonly player: Player;
  /**
   * Cash in hand at `round_start` (after round-start income is applied).
   * This is "money available to spend this round."
   */
  readonly startMoney: number;
  /**
   * Cash in hand at `round_end`. Reflects actual remaining money after
   * purchases and any adjustments made during the round.
   */
  readonly endMoney: number;
  /** All `item_purchase` events for this player during this round, in wire order. */
  readonly purchases: ItemPurchaseEvent[];
  /**
   * Total equipment value bought this round.
   *
   * v1.0: always `0` — we don't have a weapon→cost table; deferred to a
   * future task. Use `startMoney - endMoney` for a rough estimate;
   * deferred for accuracy.
   */
  readonly equipmentValue: number;
}

/** Mutable in-progress economy record. `endMoney` is updated on `round_end`. */
interface MutableEconomy {
  readonly player: Player;
  readonly startMoney: number;
  endMoney: number;
  readonly purchases: ItemPurchaseEvent[];
  readonly equipmentValue: number;
}

/**
 * Economy tracker. Attach to a `DemoParser` before `parseAll()`.
 * Call `getEconomy(roundIdx, slot)` after parsing to read per-player data.
 */
export class EconomyTracker {
  /**
   * Indexed like `DemoResult.rounds`. Each bucket maps player slot (CCSPlayer
   * entity id, 1-based) to that player's economy record.
   */
  private readonly rounds = new RoundBuckets<Map<number, MutableEconomy>>(
    (synthesized) => (synthesized ? new Map() : this.snapshotStartMoney()),
    (roundMap) => this.recordEndMoney(roundMap),
  );
  /** Reference kept so handlers can read `parser.players` at event time. */
  private parser: DemoParser | null = null;

  /**
   * Wire the tracker to a parser by subscribing to the round boundary
   * events and `item_purchase`. Must be called before `parseAll()`.
   */
  attach(parser: DemoParser): void {
    this.parser = parser;
    this.rounds.attach(parser);
    parser.on("item_purchase", (e) => this.onPurchase(e));
  }

  /**
   * Retrieve the economy record for a given round index and player slot.
   *
   * @param roundIdx - 0-based round index (matches `DemoResult.rounds`).
   * @param slot     - Player entity slot (`Player.slot`, 1-based CCSPlayer id).
   * @returns The economy record, or `undefined` if the round/player is absent.
   */
  getEconomy(roundIdx: number, slot: number): PlayerRoundEconomy | undefined {
    return this.rounds.at(roundIdx)?.get(slot);
  }

  // ---------------------------------------------------------------------------
  // Event handlers — called synchronously during parseAll()
  // ---------------------------------------------------------------------------

  private snapshotStartMoney(): Map<number, MutableEconomy> {
    const roundMap = new Map<number, MutableEconomy>();

    // Snapshot every live player's money as startMoney. The buy menu opens
    // during freeze time (which begins at or just after round_start), so
    // this gives "money available to spend" — the figure the player sees
    // when they open the buy menu.
    for (const player of this.parser!.players) {
      const money = player.money;
      roundMap.set(player.slot, {
        player,
        startMoney: money,
        endMoney: money,
        purchases: [],
        equipmentValue: 0,
      });
    }
    return roundMap;
  }

  private onPurchase(e: ItemPurchaseEvent): void {
    // Between rounds (warmup, after the match): no round to file it under.
    const roundMap = this.rounds.openBucket;
    if (roundMap === undefined) return;

    let entry = roundMap.get(e.player.slot);

    if (entry === undefined) {
      // Player joined mid-round — no round_start snapshot available.
      // Create a best-effort entry using their current money as startMoney.
      const money = e.player.money;
      entry = {
        player: e.player,
        startMoney: money,
        endMoney: money,
        purchases: [],
        equipmentValue: 0,
      };
      roundMap.set(e.player.slot, entry);
    }

    entry.purchases.push(e);
  }

  private recordEndMoney(roundMap: Map<number, MutableEconomy>): void {
    // Snapshot every live player's money as endMoney. This reflects actual
    // remaining cash after purchases and any mid-round adjustments.
    for (const player of this.parser!.players) {
      const entry = roundMap.get(player.slot);
      if (entry !== undefined) {
        // Update endMoney in-place. The public interface types this as
        // readonly (PlayerRoundEconomy.endMoney) but MutableEconomy allows
        // the mutation here during assembly.
        entry.endMoney = player.money;
      }
      // Players who joined after round_start and never purchased (no entry
      // yet): skip — they'd have meaningless startMoney anyway.
    }
  }
}
