/**
 * PositionTracker — captures player world-space positions at a configurable
 * tick interval, for heatmaps, movement-pattern analysis, and replay-style
 * visualisations.
 *
 * Why sample, not record every tick:
 *   A competitive CS:GO demo runs at 64 ticks/second over ~30 minutes, so
 *   ~115 200 ticks per match. Recording every tick for 10 players would emit
 *   over a million `PositionSnapshot` records — enough to balloon a parsed
 *   `DemoResult` past 100 MB and spike GC pressure on every analysis run.
 *   Most consumers (heatmaps, route-overlap, movement-anomaly detection) get
 *   indistinguishable results at a coarser cadence. Default sample rate is
 *   every 32 ticks (~0.5 s on a 64-tick server) — fine enough to see a
 *   player walk corner-to-corner, coarse enough to keep a long demo's output
 *   under 200 k snapshots and well within typical heatmap-bucket resolution.
 *
 * Sampling hook: there is no per-tick parser event, so the tracker piggy-backs
 * on `entityUpdated`, which fires for every entity on every tick that entity
 * is networked. We compare `parser.currentTick` to the last sampled tick and
 * sample at most once per tick boundary — effectively a "tickEnd" replacement
 * with O(1) overhead per entity update.
 *
 * Alive/dead policy: every live `Player` reference is sampled regardless of
 * `isAlive` state. Dead players still have a position (the corpse / last
 * death location) which is useful for some analyses, and consumers can filter
 * trivially via `snapshot.player.isAlive`. Disconnected players are absent —
 * their CCSPlayer entities are removed from the entity list, so the
 * `parser.players` walk simply skips them.
 *
 * Memory note (opt-in by default in `DemoParser.parse()`): even at 32-tick
 * sampling a 30-minute demo yields ~36 000 snapshots. We keep `Player` by
 * reference (matching `EconomyTracker`'s pattern) so each snapshot is a small
 * record of `tick + xyz + a player handle`, not a deep clone — the dominant
 * cost is the array length itself.
 */

import type { DemoParser } from "../DemoParser.js";
import type { Player } from "../state/Player.js";

/** Default tick interval between samples (~0.5s at 64 tick/s). */
const DEFAULT_SAMPLE_RATE_TICKS = 32;

/**
 * A single player position sample at a specific frame tick.
 *
 * `player` is held by reference (live overlay), matching the convention used
 * by other convenience trackers. `x`/`y`/`z` are captured-at-sample-time
 * scalars — they remain stable even after the underlying entity ticks
 * forward, unlike reads through `snapshot.player.position` which return the
 * current (latest) tick's value.
 */
export interface PositionSnapshot {
  /** Parser frame tick at which this sample was taken. */
  readonly tick: number;
  /** The live `Player` overlay this sample was taken from. */
  readonly player: Player;
  /** World-space X coordinate at the sample tick. */
  readonly x: number;
  /** World-space Y coordinate at the sample tick. */
  readonly y: number;
  /** World-space Z coordinate at the sample tick. */
  readonly z: number;
}

/** Options for `PositionTracker.attach()`. */
export interface PositionTrackerOptions {
  /**
   * Sample positions every N ticks. Defaults to {@link DEFAULT_SAMPLE_RATE_TICKS}
   * (32) — see the class JSDoc for why.
   *
   * Must be a positive integer. Values `<= 0` are coerced up to `1` (every
   * tick) to avoid an infinite no-sample loop.
   */
  readonly sampleRateTicks?: number;
}

/**
 * Position tracker. Attach to a `DemoParser` before `parseAll()`.
 * Call `snapshot()` after parsing to retrieve the captured samples in
 * tick-ascending order.
 */
export class PositionTracker {
  private readonly samples: PositionSnapshot[] = [];
  /** Tick interval between samples. Resolved at `attach()` time. */
  private sampleRate = DEFAULT_SAMPLE_RATE_TICKS;
  /**
   * Tick at which the previous sample fired. `-Infinity` is the "never
   * sampled yet" sentinel — guarantees the very first qualifying tick
   * triggers a sample regardless of where the demo's tick counter starts.
   */
  private lastSampledTick = -Infinity;
  /** Reference kept so the sampling handler can read `parser.players` lazily. */
  private parser: DemoParser | null = null;

  /**
   * Wire the tracker to a parser. Subscribes to `entityUpdated` as a
   * proxy "tick fires" hook — see the class JSDoc for the rationale.
   * Must be called before `parser.parseAll()`.
   *
   * @param parser  - the `DemoParser` to attach to.
   * @param options - optional config; `sampleRateTicks` overrides the default
   *                  32-tick sampling cadence.
   */
  attach(parser: DemoParser, options: PositionTrackerOptions = {}): void {
    this.parser = parser;
    const requested = options.sampleRateTicks ?? DEFAULT_SAMPLE_RATE_TICKS;
    // Coerce non-positive rates up to 1: a zero or negative interval would
    // mean "sample every tick infinitely often", which is meaningless and
    // would still re-fire only once per tick because of the `>=` guard
    // below. Pinning to 1 keeps the contract clear.
    this.sampleRate = requested > 0 ? requested : 1;

    // entityUpdated fires once per entity per tick. We dedupe to one sample
    // per tick by comparing parser.currentTick against the last sampled tick
    // — this turns the per-entity stream into a per-tick boundary signal
    // without needing a dedicated tickEnd event.
    parser.on("entityUpdated", () => this.onEntityUpdated());
  }

  /**
   * Retrieve the captured position samples, in tick-ascending order. The
   * returned array is the tracker's own buffer — do not mutate; treat as
   * `readonly` even where TypeScript can't enforce it (e.g. across .js
   * boundaries).
   */
  snapshot(): readonly PositionSnapshot[] {
    return this.samples;
  }

  // ---------------------------------------------------------------------------
  // Event handlers — called synchronously during parseAll()
  // ---------------------------------------------------------------------------

  private onEntityUpdated(): void {
    const parser = this.parser;
    if (parser === null) return;
    const tick = parser.currentTick;

    // Sample only when the configured tick interval has elapsed since the
    // last sample. The first qualifying tick always fires (lastSampledTick
    // starts at -Infinity).
    if (tick - this.lastSampledTick < this.sampleRate) return;
    this.lastSampledTick = tick;

    // Capture every live player's position at this tick. We read x/y/z as
    // scalars (not the live `position` getter object) so the sample value
    // stays stable past the next tick — a held `Vector3` from
    // `player.position` is frozen but the next read returns a different
    // frozen object, which is fine; the scalar copy avoids retaining one
    // small frozen object per snapshot.
    for (const player of parser.players) {
      const pos = player.position;
      this.samples.push({
        tick,
        player,
        x: pos.x,
        y: pos.y,
        z: pos.z,
      });
    }
  }
}
