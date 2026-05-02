/**
 * RoundTracker — derives a four-state round phase from `GameRules` updates.
 *
 * The Source engine doesn't network a single "round phase" enum. The phase a
 * consumer cares about (warmup / freeze / live / over) is a *derivation* of
 * three networked GameRules properties that all live on the
 * `CCSGameRulesProxy` entity:
 *
 *   - `m_bWarmupPeriod`   — true throughout warmup; the `gamePhase` int alone
 *                           does NOT distinguish warmup from regulation play.
 *   - `m_gamePhase`       — match-level phase (2=first half, 3=second half,
 *                           4=halftime, 5=postgame). Per-round transitions
 *                           are NOT signalled here — the int is stable across
 *                           an entire half.
 *   - `m_iRoundWinStatus` — 0 while a round is in progress, non-zero (2=CT,
 *                           3=T, ...) once the round has ended. Resets to 0
 *                           at the start of the next round's freeze period.
 *   - `m_bFreezePeriod`   — true during the freeze countdown at round start.
 *
 * The de_nuke fixture confirms this: `m_gamePhase` is `2` for all of rounds
 * 0..14, `3` for rounds 15..29, briefly `4` (halftime) at the round-15 swap,
 * and `5` (postgame) after dem_stop. `m_iRoundWinStatus` is the per-round
 * "over" signal — it flips to 2 or 3 on every round end and resets to 0 on
 * the next freeze tick.
 *
 * The mapping (top-down; first match wins) is:
 *
 *   isWarmup === true                           → "warmup"
 *   gamePhase === 5  (postgame)                 → "over"
 *   gamePhase === 4  (halftime)                 → "over"
 *   roundWinStatus !== 0  (round just ended)    → "over"
 *   isFreezePeriod === true                     → "freeze"
 *   else                                        → "live"
 *
 * "over" is checked before "freeze" because a single tick can carry both
 * signals (the engine sometimes sets the next round's freeze flag on the
 * same tick the previous round's win-status latches). Surfacing "over"
 * first lets consumers count round-end transitions without double-emit.
 *
 * Round numbering follows the engine: `totalRoundsPlayed` is the count of
 * COMPLETED rounds (0-based). It increments at the moment the round ends —
 * the same tick the win-status flips to non-zero — so the `roundNumber` we
 * attach to a `roundStateChanged` event for "over" is the index of the
 * *just-completed* round (1-based for round 1's end, etc.). Warmup rounds
 * do NOT increment `totalRoundsPlayed` — confirmed on de_nuke (the warmup
 * → live transition leaves `totalRoundsPlayed` at 0).
 */

/** The four phases a round (or surrounding match-level state) can be in. */
export type RoundPhase = "warmup" | "freeze" | "live" | "over";

/** Minimal subset of `GameRules` that RoundTracker reads on each update. */
export interface RoundPhaseInputs {
  readonly gamePhase: number;
  readonly isWarmup: boolean;
  readonly isFreezePeriod: boolean;
  readonly roundWinStatus: number;
  readonly totalRoundsPlayed: number;
}

/**
 * Pure phase-mapping function. Derives the round phase from the four
 * networked GameRules signals. Order of branches is the public contract —
 * see the file-level JSDoc for the rationale.
 */
export function computeRoundPhase(state: RoundPhaseInputs): RoundPhase {
  if (state.gamePhase === 5) return "over";
  if (state.gamePhase === 4) return "over";
  if (state.isWarmup) return "warmup";
  if (state.roundWinStatus !== 0) return "over";
  if (state.isFreezePeriod) return "freeze";
  return "live";
}

/** Payload of the `roundStateChanged` parser event. */
export interface RoundStateChange {
  readonly phase: RoundPhase;
  readonly previousPhase: RoundPhase | undefined;
  /**
   * `gameRules.totalRoundsPlayed` at the moment of the transition. For an
   * "over" transition this is the index of the just-completed round (the
   * engine increments the counter on the same tick the round ends). For
   * "warmup" / "freeze" / "live" transitions it is the index of the
   * upcoming or in-progress round.
   */
  readonly roundNumber: number;
}

/**
 * Subscribes to GameRules updates and emits a `RoundStateChange` exactly
 * once per phase transition. Consumed by `DemoParser` — wired in `parseAll`
 * to the `entityUpdated` event filtered to CCSGameRulesProxy.
 *
 * The constructor takes an `emit` callback rather than embedding a
 * `TypedEventEmitter` so the tracker stays pure and trivially testable —
 * the parser is the one that owns the emitter and bridges the callback to
 * the wire-level `roundStateChanged` event.
 */
export class RoundTracker {
  private _phase: RoundPhase | undefined = undefined;
  private _roundNumber = 0;
  private readonly emit: (change: RoundStateChange) => void;

  constructor(emit: (change: RoundStateChange) => void) {
    this.emit = emit;
  }

  /** Last computed phase, or `undefined` if no update has been processed. */
  get phase(): RoundPhase | undefined {
    return this._phase;
  }

  /** Last observed `gameRules.totalRoundsPlayed`. `0` before the first update. */
  get roundNumber(): number {
    return this._roundNumber;
  }

  /**
   * Apply one observation of GameRules state. Recomputes the phase; if it
   * differs from the previous phase (including the "no previous phase yet"
   * case) emits a `RoundStateChange`. Idempotent in the steady state — the
   * vast majority of GameRules entityUpdated ticks carry no phase change.
   */
  onUpdate(state: RoundPhaseInputs): void {
    const next = computeRoundPhase(state);
    this._roundNumber = state.totalRoundsPlayed;
    if (next === this._phase) return;
    const previousPhase = this._phase;
    this._phase = next;
    this.emit({
      phase: next,
      previousPhase,
      roundNumber: state.totalRoundsPlayed,
    });
  }
}
