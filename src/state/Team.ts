/**
 * Team — typed live overlay over a CCSTeam entity.
 *
 * Per ADR-004 / ADR-005 this is a *live view*, not a snapshot. Every getter
 * re-reads the latest property value from the underlying `Entity`; flat-prop
 * indices are resolved exactly once at construction and cached as plain
 * numbers so reads are typed-array dereferences, not name lookups. Missing
 * props at construction throw — the schema invariants are loud, not silent.
 *
 * One CCSTeam entity exists per side. On the de_nuke fixture there are four:
 *
 *   - `m_iTeamNum = 0` — Unassigned
 *   - `m_iTeamNum = 1` — Spectator
 *   - `m_iTeamNum = 2` — T (Terrorists)
 *   - `m_iTeamNum = 3` — CT (Counter-Terrorists)
 *
 * The numeric `team` getter is the canonical side identifier and matches
 * the {@link import("../enums/TeamSide.js").TeamSide} enum. Mapping from the
 * entity to a side is intentionally not done in this overlay — `team`
 * already carries the value and consumers that want the symbolic name can
 * compare against `TeamSide.T` / `TeamSide.CT` directly.
 *
 * The full schema (de_nuke, 16 flat props):
 *
 *   - `m_iTeamNum`         (int)    — side identifier
 *   - `m_bSurrendered`     (int→bool)
 *   - `m_scoreTotal`       (int)    — round wins this match
 *   - `m_scoreFirstHalf`   (int)
 *   - `m_scoreSecondHalf`  (int)
 *   - `m_scoreOvertime`    (int)
 *   - `m_iClanID`          (int)    — Steam group id
 *   - `m_szTeamname`       (string) — `"TERRORIST"`, `"CT"`, `"Spectator"`,
 *                                     `"Unassigned"`
 *   - `m_szClanTeamname`   (string) — clan tag
 *   - `m_szTeamFlagImage`  (string)
 *   - `m_szTeamLogoImage`  (string)
 *   - `m_szTeamMatchStat`  (string)
 *   - `m_nGGLeaderEntIndex_CT` (int) — gun-game leader, skipped (mode-specific)
 *   - `m_nGGLeaderEntIndex_T`  (int) — ditto
 *   - `m_numMapVictories`  (int)    — match-series score (Bo3/Bo5)
 *   - `"player_array"`     (array)  — entity ids of CCSPlayer entities on
 *                                     this team. Note: the wire varName
 *                                     literally contains the surrounding
 *                                     quote characters; this is what the
 *                                     ts-proto decode preserves from the
 *                                     SendTable, and what the overlay
 *                                     resolves on.
 *
 * The two `m_nGGLeaderEntIndex_*` props are gun-game-mode artifacts. We
 * deliberately do NOT expose them — TASK-030 scopes side, score, name, and
 * the player roster, and gold-plating overlay surfaces is what ADR-005
 * exists to prevent. They can be added later without breaking the API.
 */
import type { Entity } from "../entities/Entity.js";

/**
 * Frozen point-in-time view of a Team's networked state. Returned by
 * {@link Team.snapshot}; safe to retain past the next tick.
 */
export interface TeamSnapshot {
  /** `m_iTeamNum`. Matches {@link import("../enums/TeamSide.js").TeamSide}. */
  readonly team: number;
  /** True when the team has surrendered (m_bSurrendered=1). */
  readonly surrendered: boolean;
  /** Round wins this match (`m_scoreTotal`) — the canonical scoreboard score. */
  readonly score: number;
  /** Round wins in the first half. */
  readonly scoreFirstHalf: number;
  /** Round wins in the second half. */
  readonly scoreSecondHalf: number;
  /** Round wins in overtime. */
  readonly scoreOvertime: number;
  /** Steam-group / clan id (0 when unset). */
  readonly clanId: number;
  /** `m_szTeamname` — `"TERRORIST"`, `"CT"`, `"Spectator"`, `"Unassigned"`. */
  readonly name: string;
  /** Clan tag / display name (`m_szClanTeamname`). */
  readonly clanName: string;
  /** Flag image asset path. */
  readonly flagImage: string;
  /** Logo image asset path. */
  readonly logoImage: string;
  /** Free-form match stat string. */
  readonly matchStat: string;
  /** Match-series score for Bo3/Bo5 (maps already won). */
  readonly numMapVictories: number;
  /**
   * Entity ids of the CCSPlayer entities on this team. Resolution to
   * `Player` overlays is the caller's job — Team has no `EntityList`
   * reference by design (ADR-004 alternatives §4 / ADR-005 §3).
   */
  readonly playerSlots: readonly number[];
}

/**
 * Look up a flat-prop index by varName, optionally restricted to a specific
 * `sourceTableName` for disambiguation. Threading `sourceTableName` is not
 * strictly needed for CCSTeam today (every prop comes from `DT_Team`), but
 * the canonical helper signature mirrors `Player.ts` per ADR-005 — the next
 * overlay that needs disambiguation gets the parameter for free.
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
    `Team overlay: prop "${name}"${where} not in ${entity.serverClass.className} schema`,
  );
}

/**
 * Two-table fallback variant for schema-drift safety. Unused on CCSTeam
 * today but kept symmetric with `Player.ts` per ADR-005 §"Inconsistencies
 * in shipped code" — the canonical helper pair is `findIdx` +
 * `findIdxFallback`, even when the second is dormant for this class.
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

/** Coerce a `PropertyValue | undefined` read into a string, defaulting to `""`. */
function readStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export class Team {
  private readonly entity: Entity;

  // Cached flat-prop indices, resolved once in the constructor.
  private readonly teamIdx: number;
  private readonly surrenderedIdx: number;
  private readonly scoreTotalIdx: number;
  private readonly scoreFirstHalfIdx: number;
  private readonly scoreSecondHalfIdx: number;
  private readonly scoreOvertimeIdx: number;
  private readonly clanIdIdx: number;
  private readonly nameIdx: number;
  private readonly clanNameIdx: number;
  private readonly flagImageIdx: number;
  private readonly logoImageIdx: number;
  private readonly matchStatIdx: number;
  private readonly numMapVictoriesIdx: number;
  private readonly playerArrayIdx: number;

  /**
   * Build an overlay over an existing CCSTeam `Entity`. Throws if any of
   * the required props are absent from the entity's ServerClass — this is
   * the loud-failure mechanism for schema drift.
   */
  constructor(entity: Entity) {
    this.entity = entity;

    this.teamIdx = findIdx(entity, "m_iTeamNum");
    this.surrenderedIdx = findIdx(entity, "m_bSurrendered");
    this.scoreTotalIdx = findIdx(entity, "m_scoreTotal");
    this.scoreFirstHalfIdx = findIdx(entity, "m_scoreFirstHalf");
    this.scoreSecondHalfIdx = findIdx(entity, "m_scoreSecondHalf");
    this.scoreOvertimeIdx = findIdx(entity, "m_scoreOvertime");
    this.clanIdIdx = findIdx(entity, "m_iClanID");
    this.nameIdx = findIdx(entity, "m_szTeamname");
    this.clanNameIdx = findIdx(entity, "m_szClanTeamname");
    this.flagImageIdx = findIdx(entity, "m_szTeamFlagImage");
    this.logoImageIdx = findIdx(entity, "m_szTeamLogoImage");
    this.matchStatIdx = findIdx(entity, "m_szTeamMatchStat");
    this.numMapVictoriesIdx = findIdx(entity, "m_numMapVictories");
    // The `player_array` varName actually contains the surrounding quote
    // characters on the wire (the SendTable defines the prop with literal
    // double-quotes around the name, and the ts-proto decode preserves
    // them). Match exactly what flattenProps produces — anything else is a
    // schema-drift bug.
    this.playerArrayIdx = findIdx(entity, '"player_array"');
  }

  private readNum(idx: number): number {
    return readNumOr0(this.entity.store.read(this.entity.storageSlot, idx));
  }

  private readString(idx: number): string {
    return readStringOrEmpty(
      this.entity.store.read(this.entity.storageSlot, idx),
    );
  }

  /** Source's `m_iTeamNum` — `{0:Unassigned, 1:Spectator, 2:T, 3:CT}`. */
  get team(): number {
    return this.readNum(this.teamIdx);
  }

  /** True when the team has surrendered (`m_bSurrendered === 1`). */
  get surrendered(): boolean {
    return this.readNum(this.surrenderedIdx) !== 0;
  }

  /** Round wins this match — the canonical scoreboard score. */
  get score(): number {
    return this.readNum(this.scoreTotalIdx);
  }

  /** Round wins in the first half. */
  get scoreFirstHalf(): number {
    return this.readNum(this.scoreFirstHalfIdx);
  }

  /** Round wins in the second half. */
  get scoreSecondHalf(): number {
    return this.readNum(this.scoreSecondHalfIdx);
  }

  /** Round wins in overtime. */
  get scoreOvertime(): number {
    return this.readNum(this.scoreOvertimeIdx);
  }

  /** Steam-group / clan id (0 when unset). */
  get clanId(): number {
    return this.readNum(this.clanIdIdx);
  }

  /** `m_szTeamname` — `"TERRORIST"`, `"CT"`, `"Spectator"`, `"Unassigned"`. */
  get name(): string {
    return this.readString(this.nameIdx);
  }

  /** Clan tag / display name (`m_szClanTeamname`). */
  get clanName(): string {
    return this.readString(this.clanNameIdx);
  }

  /** Flag image asset path. */
  get flagImage(): string {
    return this.readString(this.flagImageIdx);
  }

  /** Logo image asset path. */
  get logoImage(): string {
    return this.readString(this.logoImageIdx);
  }

  /** Free-form match stat string. */
  get matchStat(): string {
    return this.readString(this.matchStatIdx);
  }

  /** Match-series score for Bo3/Bo5 (maps already won). */
  get numMapVictories(): number {
    return this.readNum(this.numMapVictoriesIdx);
  }

  /**
   * Entity ids of the CCSPlayer entities currently on this team. Returns
   * a frozen `number[]` — consumers who need to retain it across ticks
   * should call `snapshot()` instead, which freezes the whole projection.
   *
   * Resolution to `Player` overlays is the caller's job — the overlay has
   * no `EntityList` reference by design (ADR-004 alternatives §4).
   */
  get playerSlots(): readonly number[] {
    const v = this.entity.store.read(
      this.entity.storageSlot,
      this.playerArrayIdx,
    );
    if (!Array.isArray(v)) return Object.freeze<number[]>([]);
    const out: number[] = new Array<number>(v.length);
    for (let i = 0; i < v.length; i++) {
      const e = v[i];
      out[i] = typeof e === "number" ? e : 0;
    }
    return Object.freeze(out);
  }

  /**
   * Capture the current values into a frozen plain object. Use this when
   * deferring processing past the next tick — the live overlay's getters
   * would otherwise re-read updated state on the deferred read.
   */
  snapshot(): TeamSnapshot {
    return Object.freeze({
      team: this.team,
      surrendered: this.surrendered,
      score: this.score,
      scoreFirstHalf: this.scoreFirstHalf,
      scoreSecondHalf: this.scoreSecondHalf,
      scoreOvertime: this.scoreOvertime,
      clanId: this.clanId,
      name: this.name,
      clanName: this.clanName,
      flagImage: this.flagImage,
      logoImage: this.logoImage,
      matchStat: this.matchStat,
      numMapVictories: this.numMapVictories,
      playerSlots: this.playerSlots,
    });
  }
}
