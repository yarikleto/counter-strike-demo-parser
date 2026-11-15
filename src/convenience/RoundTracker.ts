/**
 * ConvenienceRoundTracker — aggregates per-round summary data from Tier-1
 * game events into `RoundSummary` objects, one per completed round.
 *
 * This is the **convenience-layer** round tracker. It is distinct from the
 * `src/state/RoundTracker.ts` entity-level tracker (TASK-034) that derives
 * round phase from `CCSGameRulesProxy` prop updates. This tracker subscribes
 * to Tier-1 game events emitted by the parser's enricher dispatch and
 * accumulates structured per-round data for the one-shot `DemoResult.rounds`
 * field (ADR-009).
 *
 * State machine:
 *   - `round_start`     → opens a new in-progress window (`current` becomes non-null).
 *   - `begin_new_match` → also opens a window. GOTV demos recorded from the
 *                         live round often start with `begin_new_match` and
 *                         no `round_start` for round 1 (the start was sent
 *                         before the recording began).
 *   - `round_end`       → closes the window, emits a `RoundSummary`, pushes to list.
 *   - `round_mvp`       → CS:GO fires it on the same tick as, and just before,
 *                         `round_end`; it is held on the open window and
 *                         attached when the round closes. An MVP arriving after
 *                         the close attaches to the most recent round.
 *   - All other events (kills, hurts, bomb events, purchases) accumulate into
 *     `current` only when `current !== null`.
 *
 * Warmup exclusion rule:
 *   A `round_end` with no open window is only discarded when GameRules
 *   reports warmup (`m_bWarmupPeriod`) at that moment, or when it is the
 *   "Game Commencing" pseudo round end (`RoundEndReason.GameStart`). A `round_end` outside warmup with no
 *   open window still produces a summary — its window starts at the previous
 *   round's end (or tick 0) and carries no per-round events. A round that has
 *   a `round_end` is never dropped.
 *
 * moneySpent (TASK-064 TODO):
 *   `item_purchase` events are subscribed here. The enriched `ItemPurchaseEvent`
 *   carries `{ player, item }` but no `cost` field — economy tracking (including
 *   purchase cost) is deferred to TASK-064. Until that task lands, `moneySpent`
 *   is set to `0` for every player in every round. When TASK-064 adds a `cost`
 *   field to `ItemPurchaseEvent` (or exposes a separate economy-state accessor),
 *   this tracker should accumulate it here instead.
 */

import type { DemoParser } from "../DemoParser.js";
import type { TeamSide } from "../enums/TeamSide.js";
import { RoundEndReason } from "../enums/RoundEndReason.js";
import type { Player } from "../state/Player.js";
import type { PlayerDeathEvent } from "../events/enrichers/playerDeath.js";
import type { PlayerHurtEvent } from "../events/enrichers/playerHurt.js";
import type { BombPlantedEvent } from "../events/enrichers/bombPlanted.js";
import type { BombDefusedEvent } from "../events/enrichers/bombDefused.js";
import type { BombExplodedEvent } from "../events/enrichers/bombExploded.js";
import type { RoundStartEvent } from "../events/enrichers/roundStart.js";
import type { RoundEndEvent } from "../events/enrichers/roundEnd.js";
import type { RoundMvpEvent } from "../events/enrichers/roundMvp.js";
import type { BeginNewMatchEvent } from "../events/enrichers/beginNewMatch.js";
import type { ItemPurchaseEvent } from "../events/enrichers/itemPurchase.js";
import type { PlayerRoundEconomy } from "./EconomyTracker.js";

/** Per-player statistics for a single round. */
export interface RoundPlayerStats {
  /** Live `Player` reference as it existed during the round. */
  readonly player: Player;
  /** Number of kills credited to this player this round. */
  kills: number;
  /** Number of times this player died this round. */
  deaths: number;
  /** Number of assists credited to this player this round. */
  assists: number;
  /** Total HP damage dealt by this player this round. */
  damage: number;
  /**
   * Total money spent by this player this round.
   *
   * TODO(TASK-064): currently always `0` — economy tracker not yet wired up.
   * When TASK-064 lands a `cost` field on `ItemPurchaseEvent`, accumulate it here.
   * Use `economy.startMoney - economy.endMoney` for a rough estimate; deferred for accuracy.
   */
  moneySpent: number;
  /**
   * Per-player per-round economy snapshot (TASK-064).
   *
   * Populated by `EconomyTracker` after `parseAll()` completes (assembled in
   * `DemoParser.parse()`). `undefined` when a player joined mid-round and
   * missed the `round_start` snapshot — rare in practice on well-formed demos.
   */
  readonly economy?: PlayerRoundEconomy;
}

/** Bomb-event buckets for a single round. */
export interface RoundBombEvents {
  /** All `bomb_planted` events that fired during this round. */
  readonly plants: BombPlantedEvent[];
  /** All `bomb_defused` events that fired during this round. */
  readonly defuses: BombDefusedEvent[];
  /** All `bomb_exploded` events that fired during this round. */
  readonly explosions: BombExplodedEvent[];
}

/**
 * Aggregated summary for one completed CS:GO round.
 *
 * Rounds are indexed by their 1-based `number`, which is derived from the
 * `round_end` event's `roundNumber` field (itself sourced from
 * `gameRules.totalRoundsPlayed`). Overtime rounds continue past 30 —
 * no special-casing is applied.
 */
export interface RoundSummary {
  /**
   * 1-based round number. Derived from the closing `round_end` event's
   * `roundNumber` (which is `gameRules.totalRoundsPlayed` — 0-based count of
   * completed rounds). We add 1 to produce the human-readable round number.
   */
  readonly number: number;
  /**
   * Winning team side (`TeamSide.T`, `TeamSide.CT`). `undefined` for warmup
   * or unfinished trailing rounds (does not occur in the normal path since the
   * tracker only emits a summary on `round_end`).
   */
  readonly winner: TeamSide | undefined;
  /**
   * Round end reason (symbolic `RoundEndReason` value or raw number for
   * forward-compat with newer server builds). `undefined` when no `round_end`
   * was observed (edge case — never occurs in the normal path).
   */
  readonly endReason: RoundEndReason | number | undefined;
  /**
   * Player awarded MVP for this round. `undefined` before `round_mvp` arrives.
   * CS:GO fires `round_mvp` AFTER `round_end`, so this field starts as
   * `undefined` and is patched in when the event arrives.
   */
  mvp: Player | undefined;
  /**
   * Parser frame tick at which `round_start` fired. Sourced from
   * `DemoParser.currentTick` at the moment of the event.
   */
  readonly startTick: number;
  /**
   * Parser frame tick at which `round_end` fired. Sourced from
   * `DemoParser.currentTick` at the moment of the event.
   */
  readonly endTick: number;
  /**
   * All `player_death` events that fell within this round's tick window,
   * in wire order.
   */
  readonly kills: PlayerDeathEvent[];
  /**
   * Per-player round statistics, keyed by entity slot (`Player.slot`).
   * The slot is a stable per-round identity (1-based entity id for CCSPlayer).
   */
  readonly players: Map<number, RoundPlayerStats>;
  /** Bomb events (plants, defuses, explosions) during this round. */
  readonly bombEvents: RoundBombEvents;
}

/** Mutable in-progress accumulator for the open round. Closed on `round_end`. */
interface RoundInProgress {
  readonly startTick: number;
  /** MVP announced before `round_end` closed the window. */
  mvp: Player | undefined;
  readonly kills: PlayerDeathEvent[];
  readonly players: Map<number, RoundPlayerStats>;
  readonly bombEvents: {
    readonly plants: BombPlantedEvent[];
    readonly defuses: BombDefusedEvent[];
    readonly explosions: BombExplodedEvent[];
  };
}

/**
 * Convenience-layer round aggregator. Attach to a `DemoParser` before
 * `parseAll()` and call `snapshot()` afterwards to retrieve the list of
 * completed `RoundSummary` objects.
 */
export class ConvenienceRoundTracker {
  private readonly rounds: RoundSummary[] = [];
  /** The currently-open round window, or `null` when between rounds / in warmup. */
  private current: RoundInProgress | null = null;
  /** Callback to read the parser's current frame tick at event-fire time. */
  private getTick: () => number = () => 0;
  /** Callback reporting whether GameRules currently says warmup. */
  private isWarmup: () => boolean = () => false;
  /** Tick of the most recent `round_end`; start of a synthesized window. */
  private lastEndTick = 0;

  /**
   * Wire the tracker to a parser by subscribing to the relevant Tier-1 events.
   * Must be called before `parser.parseAll()`.
   *
   * @param parser - the `DemoParser` instance to attach to.
   */
  attach(parser: DemoParser): void {
    // Capture a tick provider so every handler reads the live frame tick.
    this.getTick = () => parser.currentTick;
    this.isWarmup = () => parser.gameRules?.isWarmup === true;

    parser.on("round_start", (e) => this.onRoundStart(e));
    parser.on("round_end", (e) => this.onRoundEnd(e));
    parser.on("begin_new_match", (e) => this.onBeginNewMatch(e));
    parser.on("player_death", (e) => this.onKill(e));
    parser.on("player_hurt", (e) => this.onHurt(e));
    parser.on("bomb_planted", (e) => this.onBombPlanted(e));
    parser.on("bomb_defused", (e) => this.onBombDefused(e));
    parser.on("bomb_exploded", (e) => this.onBombExploded(e));
    parser.on("round_mvp", (e) => this.onMvp(e));
    // item_purchase is in the typed event map (TASK-043) but carries no `cost`
    // field in the current enricher. Subscribe for forward-compat — when
    // TASK-064 adds cost tracking this handler will be the hook point.
    parser.on("item_purchase", (e) => this.onItemPurchase(e));
  }

  /** Return the accumulated list of completed `RoundSummary` objects. */
  snapshot(): RoundSummary[] {
    return this.rounds;
  }

  // -------------------------------------------------------------------------
  // Event handlers — called synchronously during parseAll()
  // -------------------------------------------------------------------------

  onRoundStart(_e: RoundStartEvent): void {
    // Open a fresh in-progress window. Any previously-open window without a
    // matching round_end (e.g. back-to-back round_starts) is discarded — the
    // new round takes precedence.
    this.current = this.openWindow(this.getTick());
  }

  onBeginNewMatch(_e: BeginNewMatchEvent): void {
    // A (re)started match begins round 1 here. Anything accumulated before
    // (warmup) is discarded. When a `round_start` follows, it simply opens
    // the window again at its own tick.
    this.current = this.openWindow(this.getTick());
  }

  onRoundEnd(e: RoundEndEvent): void {
    if (this.current === null) {
      // Warmup round_ends and the "Game Commencing" pseudo round end are not
      // part of the match.
      if (this.isWarmup() || e.reason === RoundEndReason.GameStart) return;
      // A live round whose start we never saw (e.g. the recording began
      // mid-round). Keep it — a round with a round_end is never dropped.
      this.current = this.openWindow(this.lastEndTick);
    }

    const summary: RoundSummary = {
      // gameRules.totalRoundsPlayed is 0-based and increments AFTER round_end.
      // At the moment round_end fires, the value equals the number of rounds
      // that have been completed BEFORE this one. Adding 1 gives the 1-based
      // number of the round that just ended.
      number: e.roundNumber + 1,
      winner: e.winner,
      endReason: e.reason,
      mvp: this.current.mvp,
      startTick: this.current.startTick,
      endTick: this.getTick(),
      kills: this.current.kills,
      players: this.current.players,
      bombEvents: this.current.bombEvents,
    };

    this.rounds.push(summary);
    this.lastEndTick = summary.endTick;
    this.current = null;
  }

  onKill(e: PlayerDeathEvent): void {
    // Drop events outside any round window (warmup, post-demo trailing events).
    if (this.current === null) return;

    this.current.kills.push(e);

    // Credit attacker kill
    if (e.attacker !== undefined) {
      this.getOrCreatePlayerStats(e.attacker).kills += 1;
    }

    // Credit victim death
    this.getOrCreatePlayerStats(e.victim).deaths += 1;

    // Credit assister
    if (e.assister !== undefined) {
      this.getOrCreatePlayerStats(e.assister).assists += 1;
    }
  }

  onHurt(e: PlayerHurtEvent): void {
    // Drop events outside any round window.
    if (this.current === null) return;

    if (e.attacker !== undefined) {
      this.getOrCreatePlayerStats(e.attacker).damage += e.damage;
    }
  }

  onBombPlanted(e: BombPlantedEvent): void {
    if (this.current === null) return;
    this.current.bombEvents.plants.push(e);
  }

  onBombDefused(e: BombDefusedEvent): void {
    if (this.current === null) return;
    this.current.bombEvents.defuses.push(e);
  }

  onBombExploded(e: BombExplodedEvent): void {
    if (this.current === null) return;
    this.current.bombEvents.explosions.push(e);
  }

  onMvp(e: RoundMvpEvent): void {
    // CS:GO fires `round_mvp` on the round_end tick, just BEFORE round_end:
    // hold it on the open window until the round closes.
    if (this.current !== null) {
      this.current.mvp = e.player;
      return;
    }
    // Arriving after the close: attach to the most recent round.
    const lastRound = this.rounds[this.rounds.length - 1];
    if (lastRound !== undefined) lastRound.mvp = e.player;
  }

  onItemPurchase(_e: ItemPurchaseEvent): void {
    // TODO(TASK-064): accumulate purchase cost into per-player `moneySpent`.
    // Currently ItemPurchaseEvent carries `{ player, item }` but no `cost`
    // field — the economy tracker (TASK-064) will extend this. Until then,
    // moneySpent stays 0 for every player in every round.
    if (this.current === null) return;
    // When TASK-064 lands: this.getOrCreatePlayerStats(e.player).moneySpent += e.cost;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private openWindow(startTick: number): RoundInProgress {
    return {
      startTick,
      mvp: undefined,
      kills: [],
      players: new Map(),
      bombEvents: { plants: [], defuses: [], explosions: [] },
    };
  }

  /**
   * Get or create per-player stats for the current round.
   * Players are keyed by their entity slot (`Player.slot`), which is the
   * 1-based CCSPlayer entity id — stable within a round.
   */
  private getOrCreatePlayerStats(player: Player): RoundPlayerStats {
    const key = player.slot;
    let stats = this.current!.players.get(key);
    if (stats === undefined) {
      stats = {
        player,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        moneySpent: 0,
      };
      this.current!.players.set(key, stats);
    }
    return stats;
  }
}
