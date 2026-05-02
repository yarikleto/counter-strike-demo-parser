/**
 * GameRules — typed live overlay over the CCSGameRulesProxy entity.
 *
 * Per ADR-004 / ADR-005 this is a *live view*, not a snapshot. Every getter
 * re-reads the latest property value from the underlying `Entity`; flat-prop
 * indices are resolved exactly once at construction and cached as plain
 * numbers so reads are typed-array dereferences, not name lookups. Missing
 * props at construction throw — the schema invariants are loud, not silent.
 *
 * One CCSGameRulesProxy entity exists per demo. The proxy is a pure
 * networking shell: every gameplay-relevant prop actually lives in a
 * sub-table that the SendTable nests beneath the proxy class. The two
 * sub-tables this overlay reads are:
 *
 *   - `DT_CSGameRules`     — match/round/phase scalars and bomb/freeze flags.
 *                            14 of the 15 props the overlay exposes live here.
 *   - `DT_RetakeGameRules` — `m_iBombSite`, the lone field carried by the
 *                            retake-mode sub-table. It exists in the schema
 *                            on every demo (de_nuke included) but is only
 *                            *written* in Retake mode; outside Retake mode
 *                            the read returns `undefined`, which the
 *                            `bombSite` getter coerces to `0`.
 *
 * Because the same `varName` could in principle appear under multiple
 * sub-tables (Source's flattener concatenates them; the proxy aggregates
 * 1126 flat props on de_nuke), the constructor threads `sourceTableName`
 * through `findIdx` exactly the way `Player.ts` does for the local /
 * non-local origin split. That gives a single canonical rule — always
 * specify the table — and prevents the next overlay from accidentally
 * picking the wrong copy of a colliding name.
 *
 * The 15 props this overlay exposes are:
 *
 *   - `m_iRoundTime`         (int)    → roundTime
 *   - `m_totalRoundsPlayed`  (int)    → totalRoundsPlayed
 *   - `m_gamePhase`          (int)    → gamePhase
 *   - `m_nOvertimePlaying`   (int)    → overtimePlaying
 *   - `m_fRoundStartTime`    (float)  → roundStartTime
 *   - `m_flRestartRoundTime` (float)  → restartRoundTime
 *   - `m_fMatchStartTime`    (float)  → matchStartTime
 *   - `m_bWarmupPeriod`      (bool)   → isWarmup
 *   - `m_bFreezePeriod`      (bool)   → isFreezePeriod
 *   - `m_bBombPlanted`       (bool)   → isBombPlanted
 *   - `m_bBombDropped`       (bool)   → isBombDropped
 *   - `m_bHasMatchStarted`   (bool)   → hasMatchStarted
 *   - `m_iRoundWinStatus`    (int)    → roundWinStatus
 *   - `m_eRoundWinReason`    (int)    → roundWinReason
 *   - `m_iBombSite`          (int)    → bombSite (DT_RetakeGameRules)
 *
 * Naming follows ADR-005: strip the `m_` prefix and the type sigil
 * (`i`/`fl`/`f`/`b`/`n`/`e`), camelCase the remainder. Booleans are exposed
 * as `is*` / `has*` derivations of the underlying int (non-zero ⇒ true),
 * not as the raw 0/1 — that matches `Player.isAlive`'s shape and is the
 * useful surface for consumers.
 *
 * Several adjacent props are deliberately NOT exposed:
 *
 *   - `m_iMatchStats_*[064]`, `m_GGProgressiveWeaponOrder*[060]` — array-
 *     indexed gun-game / scoreboard slots. ADR-005 §4 covers the
 *     `<stat>ForSlot(slot)` shape for those; sprint scope keeps GameRules
 *     to the round/phase scalars and defers stats to a follow-up.
 *   - `m_bTerroristTimeOutActive` / timeout family — exposing them later
 *     is additive; locking the v0.1 surface to round/bomb/match keeps the
 *     overlay reviewable.
 *   - `m_szTournamentEventName` and other tournament-broadcast strings —
 *     out of scope for v0.1 (rare usage, not on de_nuke's hot path).
 *
 * They can be added without breaking the API.
 */
import type { Entity } from "../entities/Entity.js";

/**
 * Frozen point-in-time view of the GameRules state. Returned by
 * {@link GameRules.snapshot}; safe to retain past the next tick.
 */
export interface GameRulesSnapshot {
  /** `m_iRoundTime` — round length in seconds (115 standard / 35 warmup). */
  readonly roundTime: number;
  /** `m_totalRoundsPlayed` — completed rounds in this match (0-based). */
  readonly totalRoundsPlayed: number;
  /** `m_gamePhase` — Source's GamePhase enum (1=warmup, 2=first half, 3=halftime, 4=second half, 5=postgame). */
  readonly gamePhase: number;
  /** `m_nOvertimePlaying` — overtime period number (0 in regulation). */
  readonly overtimePlaying: number;
  /** `m_fRoundStartTime` — server time (seconds) when the current round started. */
  readonly roundStartTime: number;
  /** `m_flRestartRoundTime` — server time when the round restart fires. */
  readonly restartRoundTime: number;
  /** `m_fMatchStartTime` — server time when the match (live config) started. */
  readonly matchStartTime: number;
  /** True during the warmup phase (`m_bWarmupPeriod !== 0`). */
  readonly isWarmup: boolean;
  /** True during the freeze period at round start. */
  readonly isFreezePeriod: boolean;
  /** True when a player is carrying or has planted the bomb on a site. */
  readonly isBombPlanted: boolean;
  /** True when the bomb has been dropped on the ground. */
  readonly isBombDropped: boolean;
  /** True once the live match config has applied (warmup is over). */
  readonly hasMatchStarted: boolean;
  /** `m_iRoundWinStatus` — Source's RoundWinStatus enum (0=in progress, 2=CT, 3=T, ...). */
  readonly roundWinStatus: number;
  /** `m_eRoundWinReason` — Source's RoundEndReason enum (target bombed, time, defused, ...). */
  readonly roundWinReason: number;
  /**
   * `m_iBombSite` (DT_RetakeGameRules) — bomb site index in Retake mode.
   * `0` outside Retake mode (the prop is unwritten on the wire).
   */
  readonly bombSite: number;
}

/**
 * Look up a flat-prop index by varName, optionally restricted to a specific
 * `sourceTableName` for disambiguation. Threading `sourceTableName` is
 * required for the GameRules overlay because the proxy class aggregates
 * props from two sub-tables (`DT_CSGameRules`, `DT_RetakeGameRules`) and a
 * future schema change could land a name collision; specifying the table
 * keeps the overlay correct under that scenario without code change.
 *
 * Throws on miss — overlay construction is the right time to assert the
 * schema is what we expect (per ADR-004).
 */
function findIdx(entity: Entity, name: string, sourceTable?: string): number {
  const props = entity.serverClass.flattenedProps;
  for (let i = 0; i < props.length; i++) {
    const p = props[i]!;
    if (
      p.prop.varName === name &&
      (sourceTable === undefined || p.sourceTableName === sourceTable)
    ) {
      return i;
    }
  }
  const where = sourceTable ? ` (sourceTable: ${sourceTable})` : "";
  throw new Error(
    `GameRules overlay: prop "${name}"${where} not in ${entity.serverClass.className} schema`,
  );
}

/**
 * Two-table fallback variant. Unused on CCSGameRulesProxy today (every prop
 * we read is uniquely keyed by `varName + sourceTableName`) but kept
 * symmetric with `Player.ts` per ADR-005 §"Inconsistencies in shipped
 * code" — the canonical helper pair is `findIdx` + `findIdxFallback`,
 * even when the second is dormant for this class.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findIdxFallback(
  entity: Entity,
  name: string,
  primary: string,
  fallback: string,
): number {
  try {
    return findIdx(entity, name, primary);
  } catch {
    return findIdx(entity, name, fallback);
  }
}

/** Coerce a `PropertyValue | undefined` read into a number, defaulting to 0. */
function readNumOr0(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export class GameRules {
  private readonly entity: Entity;

  // Cached flat-prop indices, resolved once in the constructor.
  // Order mirrors the test scaffold and the JSDoc table above.
  private readonly roundTimeIdx: number;
  private readonly totalRoundsPlayedIdx: number;
  private readonly gamePhaseIdx: number;
  private readonly overtimePlayingIdx: number;
  private readonly roundStartTimeIdx: number;
  private readonly restartRoundTimeIdx: number;
  private readonly matchStartTimeIdx: number;
  private readonly warmupPeriodIdx: number;
  private readonly freezePeriodIdx: number;
  private readonly bombPlantedIdx: number;
  private readonly bombDroppedIdx: number;
  private readonly hasMatchStartedIdx: number;
  private readonly roundWinStatusIdx: number;
  private readonly roundWinReasonIdx: number;
  private readonly bombSiteIdx: number;

  /**
   * Build an overlay over an existing CCSGameRulesProxy `Entity`. Throws if
   * any of the required props are absent from the entity's ServerClass —
   * this is the loud-failure mechanism for schema drift (ADR-004).
   */
  constructor(entity: Entity) {
    this.entity = entity;

    this.roundTimeIdx = findIdx(entity, "m_iRoundTime", "DT_CSGameRules");
    this.totalRoundsPlayedIdx = findIdx(
      entity,
      "m_totalRoundsPlayed",
      "DT_CSGameRules",
    );
    this.gamePhaseIdx = findIdx(entity, "m_gamePhase", "DT_CSGameRules");
    this.overtimePlayingIdx = findIdx(
      entity,
      "m_nOvertimePlaying",
      "DT_CSGameRules",
    );
    this.roundStartTimeIdx = findIdx(
      entity,
      "m_fRoundStartTime",
      "DT_CSGameRules",
    );
    this.restartRoundTimeIdx = findIdx(
      entity,
      "m_flRestartRoundTime",
      "DT_CSGameRules",
    );
    this.matchStartTimeIdx = findIdx(
      entity,
      "m_fMatchStartTime",
      "DT_CSGameRules",
    );
    this.warmupPeriodIdx = findIdx(
      entity,
      "m_bWarmupPeriod",
      "DT_CSGameRules",
    );
    this.freezePeriodIdx = findIdx(
      entity,
      "m_bFreezePeriod",
      "DT_CSGameRules",
    );
    this.bombPlantedIdx = findIdx(entity, "m_bBombPlanted", "DT_CSGameRules");
    this.bombDroppedIdx = findIdx(entity, "m_bBombDropped", "DT_CSGameRules");
    this.hasMatchStartedIdx = findIdx(
      entity,
      "m_bHasMatchStarted",
      "DT_CSGameRules",
    );
    this.roundWinStatusIdx = findIdx(
      entity,
      "m_iRoundWinStatus",
      "DT_CSGameRules",
    );
    this.roundWinReasonIdx = findIdx(
      entity,
      "m_eRoundWinReason",
      "DT_CSGameRules",
    );
    // m_iBombSite lives on DT_RetakeGameRules, the lone exception.
    this.bombSiteIdx = findIdx(entity, "m_iBombSite", "DT_RetakeGameRules");
  }

  private readNum(idx: number): number {
    return readNumOr0(this.entity.store.read(this.entity.storageSlot, idx));
  }

  /** Round length in seconds (115 standard, 35 warmup). */
  get roundTime(): number {
    return this.readNum(this.roundTimeIdx);
  }

  /** Completed rounds in this match (0-based; not the *current* round number). */
  get totalRoundsPlayed(): number {
    return this.readNum(this.totalRoundsPlayedIdx);
  }

  /** Source's GamePhase enum (1=warmup, 2=first half, 3=halftime, 4=second half, 5=postgame). */
  get gamePhase(): number {
    return this.readNum(this.gamePhaseIdx);
  }

  /** Overtime period number (0 in regulation, 1+ during overtime). */
  get overtimePlaying(): number {
    return this.readNum(this.overtimePlayingIdx);
  }

  /** Server time (seconds) when the current round started. */
  get roundStartTime(): number {
    return this.readNum(this.roundStartTimeIdx);
  }

  /** Server time when the round restart fires (post-round-end). */
  get restartRoundTime(): number {
    return this.readNum(this.restartRoundTimeIdx);
  }

  /** Server time when the live match config applied (warmup ended). */
  get matchStartTime(): number {
    return this.readNum(this.matchStartTimeIdx);
  }

  /** True during the warmup phase (`m_bWarmupPeriod !== 0`). */
  get isWarmup(): boolean {
    return this.readNum(this.warmupPeriodIdx) !== 0;
  }

  /** True during the freeze period at round start. */
  get isFreezePeriod(): boolean {
    return this.readNum(this.freezePeriodIdx) !== 0;
  }

  /** True when a player is carrying or has planted the bomb on a site. */
  get isBombPlanted(): boolean {
    return this.readNum(this.bombPlantedIdx) !== 0;
  }

  /** True when the bomb has been dropped on the ground. */
  get isBombDropped(): boolean {
    return this.readNum(this.bombDroppedIdx) !== 0;
  }

  /** True once the live match config has applied (warmup is over). */
  get hasMatchStarted(): boolean {
    return this.readNum(this.hasMatchStartedIdx) !== 0;
  }

  /** Source's RoundWinStatus enum (0=in progress, 2=CT win, 3=T win, ...). */
  get roundWinStatus(): number {
    return this.readNum(this.roundWinStatusIdx);
  }

  /** Source's RoundEndReason enum (target bombed, time, defused, ...). */
  get roundWinReason(): number {
    return this.readNum(this.roundWinReasonIdx);
  }

  /**
   * Bomb site index in Retake mode. `0` outside Retake mode (the prop is
   * unwritten on the wire and the `readNum` coercion defaults to 0).
   */
  get bombSite(): number {
    return this.readNum(this.bombSiteIdx);
  }

  /**
   * Capture the current values into a frozen plain object. Use this when
   * deferring processing past the next tick — the live overlay's getters
   * would otherwise re-read updated state on the deferred read.
   */
  snapshot(): GameRulesSnapshot {
    return Object.freeze({
      roundTime: this.roundTime,
      totalRoundsPlayed: this.totalRoundsPlayed,
      gamePhase: this.gamePhase,
      overtimePlaying: this.overtimePlaying,
      roundStartTime: this.roundStartTime,
      restartRoundTime: this.restartRoundTime,
      matchStartTime: this.matchStartTime,
      isWarmup: this.isWarmup,
      isFreezePeriod: this.isFreezePeriod,
      isBombPlanted: this.isBombPlanted,
      isBombDropped: this.isBombDropped,
      hasMatchStarted: this.hasMatchStarted,
      roundWinStatus: this.roundWinStatus,
      roundWinReason: this.roundWinReason,
      bombSite: this.bombSite,
    });
  }
}
