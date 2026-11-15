/**
 * RoundBuckets — the round boundaries of `DemoResult.rounds`, shared by the
 * convenience trackers that bucket data per round (`ConvenienceRoundTracker`,
 * `DamageMatrix`, `EconomyTracker`) so their round indices always agree.
 *
 * `ConvenienceRoundTracker` applies the same rules with its own state and
 * shares {@link isMatchRoundEnd}.
 *
 * Rules:
 *   - `round_start` and `begin_new_match` open a round. Opening again before
 *     a `round_end` replaces the open round (`begin_new_match` and the first
 *     `round_start` usually arrive back to back).
 *   - `round_end` closes the open round and commits it as the next index.
 *   - A `round_end` with no open round still makes a round — GOTV demos
 *     recorded from the live round can lack round 1's `round_start` — unless
 *     GameRules reports warmup or it is the "Game Commencing" pseudo round
 *     end ({@link isMatchRoundEnd}).
 *
 * Index `n` is the n-th committed round; while a round is open it is
 * addressable at index `committed.length`, so callers can read the round in
 * progress during parsing.
 */
import type { DemoParser } from "../DemoParser.js";
import type { RoundEndEvent } from "../events/enrichers/roundEnd.js";
import { RoundEndReason } from "../enums/RoundEndReason.js";

/**
 * Whether a `round_end` belongs to the match (and so produces an entry of
 * `DemoResult.rounds`). Only a `round_end` with no open round is ever
 * discarded: during warmup, or the "Game Commencing" pseudo round end.
 */
export function isMatchRoundEnd(
  e: Pick<RoundEndEvent, "reason">,
  hasOpenRound: boolean,
  isWarmup: boolean,
): boolean {
  return hasOpenRound || !(isWarmup || e.reason === RoundEndReason.GameStart);
}

export class RoundBuckets<T> {
  private current: T | undefined;
  private readonly committed: T[] = [];
  private isWarmup: () => boolean = () => false;

  /**
   * @param create  - a fresh bucket; `synthesized` is true for a round whose
   *                  start was never seen (the bucket is created at its end).
   * @param onClose - called with each bucket as its round ends.
   */
  constructor(
    private readonly create: (synthesized: boolean) => T,
    private readonly onClose?: (bucket: T) => void,
  ) {}

  attach(parser: DemoParser): void {
    this.isWarmup = () => parser.gameRules?.isWarmup === true;
    parser.on("round_start", () => this.open());
    parser.on("begin_new_match", () => this.open());
    parser.on("round_end", (e) => this.close(e));
  }

  open(): void {
    this.current = this.create(false);
  }

  close(e: Pick<RoundEndEvent, "reason">): void {
    if (!isMatchRoundEnd(e, this.current !== undefined, this.isWarmup())) return;
    const bucket = this.current ?? this.create(true);
    this.onClose?.(bucket);
    this.committed.push(bucket);
    this.current = undefined;
  }

  /** The open round's bucket, or `undefined` between rounds. */
  get openBucket(): T | undefined {
    return this.current;
  }

  /** Bucket of round `index` (0-based, as in `DemoResult.rounds`). */
  at(index: number): T | undefined {
    if (index < this.committed.length) return this.committed[index];
    return index === this.committed.length ? this.current : undefined;
  }
}
