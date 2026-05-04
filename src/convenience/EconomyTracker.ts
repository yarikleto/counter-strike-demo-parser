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
 * Warmup exclusion (mirrors ConvenienceRoundTracker):
 *   Events arriving before the first `round_start` are silently dropped.
 *   `currentIdx` stays at -1 until `round_start` fires. A player joining
 *   mid-round (i.e. `item_purchase` arrives with no prior round_start for
 *   that player) gets a best-effort entry with `startMoney: e.player.money`
 *   at the time of purchase.
 *
 * Round indexing: 0-based, matching `DemoResult.rounds` and
 * `DamageMatrix` round indexes.
 */

import type { DemoParser } from "../DemoParser.js";
import type { Player } from "../state/Player.js";
import type { ItemPurchaseEvent } from "../events/enrichers/itemPurchase.js";

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
   * Indexed by round index (0-based). Each element is a Map from player
   * slot (CCSPlayer entity id, 1-based) to that player's economy record.
   */
  private readonly perRound: Map<number, MutableEconomy>[] = [];
  /** 0-based current round index. -1 = pre-warmup (no round_start yet). */
  private currentIdx = -1;
  /** Reference kept so handlers can read `parser.players` at event time. */
  private parser: DemoParser | null = null;

  /**
   * Wire the tracker to a parser by subscribing to `round_start`,
   * `item_purchase`, and `round_end`. Must be called before `parseAll()`.
   */
  attach(parser: DemoParser): void {
    this.parser = parser;
    parser.on("round_start", () => this.onRoundStart());
    parser.on("item_purchase", (e) => this.onPurchase(e));
    parser.on("round_end", () => this.onRoundEnd());
  }

  /**
   * Retrieve the economy record for a given round index and player slot.
   *
   * @param roundIdx - 0-based round index (matches `DemoResult.rounds`).
   * @param slot     - Player entity slot (`Player.slot`, 1-based CCSPlayer id).
   * @returns The economy record, or `undefined` if the round/player is absent.
   */
  getEconomy(roundIdx: number, slot: number): PlayerRoundEconomy | undefined {
    return this.perRound[roundIdx]?.get(slot);
  }

  // ---------------------------------------------------------------------------
  // Event handlers — called synchronously during parseAll()
  // ---------------------------------------------------------------------------

  private onRoundStart(): void {
    this.currentIdx += 1;
    const roundMap = new Map<number, MutableEconomy>();
    this.perRound.push(roundMap);

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
  }

  private onPurchase(e: ItemPurchaseEvent): void {
    // Pre-warmup guard: drop events before any round_start.
    if (this.currentIdx < 0) return;

    const roundMap = this.perRound[this.currentIdx]!;
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

  private onRoundEnd(): void {
    // Pre-warmup guard: if no round_start preceded this event, do nothing.
    if (this.currentIdx < 0) return;

    const roundMap = this.perRound[this.currentIdx]!;

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
