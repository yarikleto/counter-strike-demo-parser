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
 * Output is plain data (ADR-009 / v0.2): players are {@link PlayerRef}s
 * captured at event time, kills and bomb events are the shared records
 * produced by {@link EventRecorder}, and per-player economy is captured
 * here — money of every T/CT player when the round opens and when it ends,
 * plus their `item_purchase`s — so it lines up with `rounds[i]` exactly.
 */
import type { DemoParser } from "../DemoParser.js";
import type { TeamSide } from "../enums/TeamSide.js";
import { RoundEndReason } from "../enums/RoundEndReason.js";
import type { Player } from "../state/Player.js";
import type { PlayerHurtEvent } from "../events/enrichers/playerHurt.js";
import type { RoundStartEvent } from "../events/enrichers/roundStart.js";
import type { RoundEndEvent } from "../events/enrichers/roundEnd.js";
import type { RoundMvpEvent } from "../events/enrichers/roundMvp.js";
import type { BeginNewMatchEvent } from "../events/enrichers/beginNewMatch.js";
import type { ItemPurchaseEvent } from "../events/enrichers/itemPurchase.js";
import { PlayerRoster } from "./PlayerRoster.js";
import type { PlayerRef } from "./PlayerRoster.js";
import type { BombRecord, KillRecord } from "./records.js";

/** A player's money and purchases in one round. */
export interface RoundPlayerEconomy {
  /** Cash when the round opened (after round-start income). */
  readonly startMoney: number;
  /** Cash when the round ended. */
  readonly endMoney: number;
  /** Item names bought this round, in order (e.g. "ak47", "vesthelm"). */
  readonly purchases: string[];
}

/** Per-player statistics for a single round. */
export interface RoundPlayerStats {
  /** The player, captured when they first appeared in this round. */
  readonly player: PlayerRef;
  /** Number of kills credited to this player this round. */
  kills: number;
  /** Number of times this player died this round. */
  deaths: number;
  /** Number of assists credited to this player this round. */
  assists: number;
  /** Total HP damage dealt by this player this round. */
  damage: number;
  /**
   * Money and purchases. `undefined` for players who were not on T/CT when
   * the round opened and bought nothing (or when the tracker runs without
   * a parser, as in unit tests).
   */
  economy: RoundPlayerEconomy | undefined;
}

/** Bomb-event buckets for a single round. */
export interface RoundBombEvents {
  /** `planted` records of this round. */
  readonly plants: BombRecord[];
  /** `defused` records of this round. */
  readonly defuses: BombRecord[];
  /** `exploded` records of this round. */
  readonly explosions: BombRecord[];
}

/**
 * Aggregated summary for one completed CS:GO round. Plain data.
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
  /** Winning team side (`TeamSide.T`, `TeamSide.CT`). */
  readonly winner: TeamSide | undefined;
  /** Round end reason (`RoundEndReason` value, or raw number for unknown codes). */
  readonly endReason: RoundEndReason | number | undefined;
  /** Player awarded MVP for this round, if any. */
  mvp: PlayerRef | undefined;
  /** Tick at which the round opened (`round_start`, `begin_new_match`, or the previous round's end). */
  readonly startTick: number;
  /** Tick of `round_freeze_end` (buy time over), if observed. */
  freezeEndTick: number | undefined;
  /** Tick of `round_end`. */
  readonly endTick: number;
  /** Kills of this round, in wire order (same objects as `DemoResult.kills`). */
  readonly kills: KillRecord[];
  /** Per-player statistics, in order of first appearance this round. */
  readonly players: RoundPlayerStats[];
  /** Bomb events (plants, defuses, explosions) during this round. */
  readonly bombEvents: RoundBombEvents;
}

/** Mutable in-progress accumulator for the open round. Closed on `round_end`. */
interface RoundInProgress {
  readonly startTick: number;
  freezeEndTick: number | undefined;
  /** MVP announced before `round_end` closed the window. */
  mvp: PlayerRef | undefined;
  readonly kills: KillRecord[];
  /** Keyed by roster index. */
  readonly players: Map<number, RoundPlayerStats>;
  readonly bombEvents: RoundBombEvents;
}

/**
 * Convenience-layer round aggregator. Attach to a `DemoParser` before
 * `parseAll()` and call `snapshot()` afterwards to retrieve the list of
 * completed `RoundSummary` objects. Kill and bomb records are pushed in by
 * the owner (see `collectDemoResult`) through {@link onKill} / {@link onBomb}.
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
  private parser: DemoParser | null = null;
  private roster: PlayerRoster | null = null;

  /**
   * Wire the tracker to a parser by subscribing to the relevant Tier-1 events.
   * Must be called before `parser.parseAll()`.
   */
  attach(parser: DemoParser): void {
    this.parser = parser;
    this.roster = PlayerRoster.for(parser);
    this.getTick = () => parser.currentTick;
    this.isWarmup = () => parser.gameRules?.isWarmup === true;

    parser.on("round_start", (e) => this.onRoundStart(e));
    parser.on("round_end", (e) => this.onRoundEnd(e));
    parser.on("begin_new_match", (e) => this.onBeginNewMatch(e));
    parser.on("round_freeze_end", () => this.onFreezeEnd());
    parser.on("player_hurt", (e) => this.onHurt(e));
    parser.on("round_mvp", (e) => this.onMvp(e));
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

  onFreezeEnd(): void {
    if (this.current !== null) this.current.freezeEndTick = this.getTick();
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
    const current = this.current;

    // Close every player's economy with the money they hold now.
    if (this.parser !== null) {
      for (const player of this.parser.players) {
        const stats = current.players.get(this.roster!.indexOf(player));
        if (stats?.economy !== undefined) {
          stats.economy = { ...stats.economy, endMoney: player.money };
        }
      }
    }

    const summary: RoundSummary = {
      // gameRules.totalRoundsPlayed is 0-based and increments AFTER round_end.
      // At the moment round_end fires, the value equals the number of rounds
      // that have been completed BEFORE this one. Adding 1 gives the 1-based
      // number of the round that just ended.
      number: e.roundNumber + 1,
      winner: e.winner,
      endReason: e.reason,
      mvp: current.mvp,
      startTick: current.startTick,
      freezeEndTick: current.freezeEndTick,
      endTick: this.getTick(),
      kills: current.kills,
      players: [...current.players.values()],
      bombEvents: current.bombEvents,
    };

    this.rounds.push(summary);
    this.lastEndTick = summary.endTick;
    this.current = null;
  }

  /** Account a kill record to the open round. */
  onKill(record: KillRecord): void {
    // Drop events outside any round window (warmup, post-demo trailing events).
    if (this.current === null) return;

    this.current.kills.push(record);
    if (record.attacker !== undefined) this.statsFor(record.attacker).kills += 1;
    this.statsFor(record.victim).deaths += 1;
    if (record.assister !== undefined) this.statsFor(record.assister).assists += 1;
  }

  /** File a bomb record into the open round's buckets. */
  onBomb(record: BombRecord): void {
    if (this.current === null) return;
    const buckets = this.current.bombEvents;
    if (record.type === "planted") buckets.plants.push(record);
    else if (record.type === "defused") buckets.defuses.push(record);
    else if (record.type === "exploded") buckets.explosions.push(record);
  }

  onHurt(e: PlayerHurtEvent): void {
    // Drop events outside any round window.
    if (this.current === null || e.attacker === undefined) return;
    this.statsForPlayer(e.attacker).damage += e.damage;
  }

  onMvp(e: RoundMvpEvent): void {
    const mvp = this.toRef(e.player);
    // CS:GO fires `round_mvp` on the round_end tick, just BEFORE round_end:
    // hold it on the open window until the round closes.
    if (this.current !== null) {
      this.current.mvp = mvp;
      return;
    }
    // Arriving after the close: attach to the most recent round.
    const lastRound = this.rounds[this.rounds.length - 1];
    if (lastRound !== undefined) lastRound.mvp = mvp;
  }

  onItemPurchase(e: ItemPurchaseEvent): void {
    if (this.current === null) return;
    const stats = this.statsForPlayer(e.player);
    if (stats.economy === undefined) {
      // Joined after the round opened: best effort, current money as start.
      const money = this.parser !== null ? e.player.money : 0;
      stats.economy = { startMoney: money, endMoney: money, purchases: [] };
    }
    stats.economy.purchases.push(e.item);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private openWindow(startTick: number): RoundInProgress {
    const window: RoundInProgress = {
      startTick,
      freezeEndTick: undefined,
      mvp: undefined,
      kills: [],
      players: new Map(),
      bombEvents: { plants: [], defuses: [], explosions: [] },
    };
    if (this.parser !== null) {
      // Snapshot every T/CT player's money as the round's start money.
      for (const player of this.parser.players) {
        if (player.team < 2) continue;
        const ref = this.roster!.ref(player);
        const money = player.money;
        window.players.set(ref.index, {
          player: ref,
          kills: 0,
          deaths: 0,
          assists: 0,
          damage: 0,
          economy: { startMoney: money, endMoney: money, purchases: [] },
        });
      }
    }
    return window;
  }

  /** Live player → plain ref (unit tests without a parser pass refs directly). */
  private toRef(player: Player | PlayerRef): PlayerRef {
    if (this.roster === null || !("position" in player)) return player as PlayerRef;
    return this.roster.ref(player);
  }

  private statsForPlayer(player: Player | PlayerRef): RoundPlayerStats {
    return this.statsFor(this.toRef(player));
  }

  /** Get or create the open round's stats for `ref` (keyed by roster index). */
  private statsFor(ref: PlayerRef): RoundPlayerStats {
    let stats = this.current!.players.get(ref.index);
    if (stats === undefined) {
      stats = { player: ref, kills: 0, deaths: 0, assists: 0, damage: 0, economy: undefined };
      this.current!.players.set(ref.index, stats);
    }
    return stats;
  }
}
