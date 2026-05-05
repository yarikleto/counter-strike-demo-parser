/**
 * Player — typed live overlay over a CCSPlayer entity.
 *
 * Per ADR-004 this class is a *live view*, not a snapshot. Every getter
 * re-reads the latest property value from the underlying `Entity`; flat-prop
 * indices are resolved exactly once at construction and cached as plain
 * numbers so reads are typed-array dereferences, not name lookups. Missing
 * props at construction throw — the schema invariants are loud, not silent
 * (ADR-004). Stale references (held past slot reuse) propagate
 * `StaleEntityError` from the underlying `Entity.assertFresh`.
 *
 * Position handling follows the actual CSGO send-table layout, which differs
 * from the simpler `m_vecOrigin[0..2]` shape one might expect: CCSPlayer
 * carries the player origin as a pair of overlapping projections, one for
 * the local (POV) player and one for everyone else. On the wire the bare
 * `varName` is the same for both pairs (`m_vecOrigin` / `m_vecOrigin[2]`),
 * so the two are disambiguated by `sourceTableName`:
 *
 *   - DT_CSLocalPlayerExclusive    `m_vecOrigin`    (VectorXY) — XY POV
 *   - DT_CSLocalPlayerExclusive    `m_vecOrigin[2]` (Float)    — Z  POV
 *   - DT_CSNonLocalPlayerExclusive `m_vecOrigin`    (VectorXY) — XY others
 *   - DT_CSNonLocalPlayerExclusive `m_vecOrigin[2]` (Float)    — Z  others
 *
 * Each tick the server only fills one of the two pairs depending on whether
 * the entity is the local player. The `position` getter reads the
 * non-local pair first and falls back to the local pair, so it works
 * uniformly across POV demos and GOTV recordings without the caller knowing
 * which side of the local/non-local split the entity sits on.
 *
 * View angles use Source's `[0] = pitch (X), [1] = yaw (Y)` convention.
 */
import type { Entity } from "../entities/Entity.js";
import type { UserInfoIndex } from "./userInfoIndex.js";
import { SteamId } from "../utils/SteamId.js";

/** A 3D position. Frozen on read so consumers can't mutate the overlay. */
export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * A camera/view orientation in degrees. Pitch is rotation about the X axis
 * (look up/down), yaw about the Y axis (look left/right). Roll is omitted
 * because CSGO does not network it on player entities.
 */
export interface ViewAngle {
  readonly yaw: number;
  readonly pitch: number;
}

/**
 * A point-in-time, frozen capture of the values a `Player` exposes. Returned
 * by `Player.snapshot()` for consumers who need to defer processing past
 * the next tick (ADR-004 escape hatch).
 */
export interface PlayerSnapshot {
  readonly slot: number;
  readonly team: number;
  readonly health: number;
  readonly money: number;
  readonly position: Vector3;
  readonly viewAngle: ViewAngle;
  readonly isAlive: boolean;
  /**
   * Raw active-weapon entity handle (Source 21- or 32-bit form). Resolution
   * to a concrete `Weapon` is the caller's job — Player intentionally has
   * no cross-reference to the weapon overlay.
   */
  readonly activeWeaponHandle: number;
  /**
   * Display name as the player advertised it via userinfo at snapshot time.
   * `undefined` when the userinfo index hasn't caught up to this slot yet
   * (rare — only when the snapshot is taken in the same tick the player's
   * entity was created, before the userinfo string-table update fires).
   */
  readonly name: string | undefined;
  /**
   * Steam ID at snapshot time, or `undefined` when userinfo isn't available.
   * Project to your preferred form via `.toSteam2()`, `.toSteam3()`, or
   * `.toSteam64()`. Bots carry `xuid: "0"` on the wire and resolve to a
   * SteamId with `accountId === 0`.
   */
  readonly steamId: SteamId | undefined;
}

/**
 * Look up a flat-prop index by varName, optionally restricted to a specific
 * `sourceTableName` for disambiguation. Several CCSPlayer props are emitted
 * twice — once under `DT_CSLocalPlayerExclusive` and once under
 * `DT_CSNonLocalPlayerExclusive` — so a bare-varName lookup would silently
 * pick the first match. Threading `sourceTable` through forces the caller
 * to be explicit about which copy they want. Throws on miss — overlay
 * construction is the right time to assert the schema is what we expect.
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
    `Player overlay: prop "${name}"${where} not in ${entity.serverClass.className} schema`,
  );
}

/**
 * Two-table fallback variant for the non-local/local origin split. The
 * non-local pair is the GOTV/general path; if the SendTable lacks it (rare
 * POV-only edge case) we fall back to the local pair. Throws if neither
 * table carries the prop, which would be a real schema break.
 */
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

/**
 * Coerce a `PropertyValue | undefined` read into a number, defaulting to 0
 * for never-written props. The CCSPlayer props this overlay reads are all
 * Int or Float at the wire level, so the runtime value is always a number
 * once written; the `typeof` guard is defence in depth, not a real branch.
 */
function readNumOr0(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export class Player {
  readonly slot: number;
  private readonly entity: Entity;
  private readonly userInfoIndex: UserInfoIndex | undefined;

  // Cached flat-prop indices, resolved once in the constructor.
  private readonly teamIdx: number;
  private readonly healthIdx: number;
  private readonly moneyIdx: number;
  private readonly originXyIdx: number;
  private readonly originZIdx: number;
  private readonly pitchIdx: number;
  private readonly yawIdx: number;
  private readonly lifeStateIdx: number;
  private readonly activeWeaponIdx: number;

  /**
   * Build an overlay over an existing CCSPlayer `Entity`. Throws if any of
   * the required props are absent from the entity's ServerClass — this is
   * the loud-failure mechanism for schema drift.
   *
   * The optional `userInfoIndex` powers the `name` and `steamId` getters.
   * It's accepted by reference, not copied, so the overlay observes the
   * latest userinfo state on every read (handles in-game renames and
   * mid-parse joins). When omitted, `name` and `steamId` always read
   * `undefined` — useful for unit tests that don't need the userinfo
   * resolution path.
   */
  constructor(
    slot: number,
    entity: Entity,
    userInfoIndex?: UserInfoIndex,
  ) {
    this.slot = slot;
    this.entity = entity;
    this.userInfoIndex = userInfoIndex;

    this.teamIdx = findIdx(entity, "m_iTeamNum");
    this.healthIdx = findIdx(entity, "m_iHealth");
    this.moneyIdx = findIdx(entity, "m_iAccount");
    // Origin: prefer the non-local pair (GOTV / non-POV path), fall back
    // to the local pair when the entity only has the POV copy.
    this.originXyIdx = findIdxFallback(
      entity,
      "m_vecOrigin",
      "DT_CSNonLocalPlayerExclusive",
      "DT_CSLocalPlayerExclusive",
    );
    this.originZIdx = findIdxFallback(
      entity,
      "m_vecOrigin[2]",
      "DT_CSNonLocalPlayerExclusive",
      "DT_CSLocalPlayerExclusive",
    );
    this.pitchIdx = findIdx(entity, "m_angEyeAngles[0]");
    this.yawIdx = findIdx(entity, "m_angEyeAngles[1]");
    this.lifeStateIdx = findIdx(entity, "m_lifeState");
    this.activeWeaponIdx = findIdx(entity, "m_hActiveWeapon");
  }

  private readNum(idx: number): number {
    return readNumOr0(this.entity.store.read(this.entity.storageSlot, idx));
  }

  /** Source's `m_iTeamNum` — `{0:Unassigned, 1:Spectator, 2:T, 3:CT}`. */
  get team(): number {
    return this.readNum(this.teamIdx);
  }

  /** Current health in HP. 0 when dead, can briefly read 0 before respawn. */
  get health(): number {
    return this.readNum(this.healthIdx);
  }

  /** Current cash on hand (`m_iAccount`). */
  get money(): number {
    return this.readNum(this.moneyIdx);
  }

  /**
   * World-space player origin. The XY pair is read as a `VectorXY`-shaped
   * value (one prop) and Z as a separate scalar — that's how Source's
   * networking encodes player origin. The non-local table is preferred at
   * construction time, with a fallback to the local table if the non-local
   * copy is missing from the SendTable.
   *
   * The returned object is frozen — consumers can hold the reference past
   * the call but mutations throw.
   */
  get position(): Vector3 {
    const xy = this.entity.store.read(
      this.entity.storageSlot,
      this.originXyIdx,
    );
    const z = this.readNum(this.originZIdx);
    const x =
      xy !== undefined && typeof xy === "object" && "x" in xy
        ? (xy as { x: number }).x
        : 0;
    const y =
      xy !== undefined && typeof xy === "object" && "y" in xy
        ? (xy as { y: number }).y
        : 0;
    return Object.freeze({ x, y, z });
  }

  /** Eye orientation in degrees. Frozen so consumers can't mutate. */
  get viewAngle(): ViewAngle {
    return Object.freeze({
      yaw: this.readNum(this.yawIdx),
      pitch: this.readNum(this.pitchIdx),
    });
  }

  /**
   * True when `m_lifeState === 0` (LIFE_ALIVE). Source uses `1=DYING` and
   * `2=DEAD` for the other animation states; we treat both as "not alive."
   */
  get isAlive(): boolean {
    return this.readNum(this.lifeStateIdx) === 0;
  }

  /**
   * Raw `m_hActiveWeapon` handle. Resolution to a `Weapon` overlay is the
   * caller's responsibility — Player has no cross-reference into the
   * weapon overlay class by design (ADR-004 + sprint scoping).
   */
  get activeWeaponHandle(): number {
    return this.readNum(this.activeWeaponIdx);
  }

  /**
   * Display name as the player advertised it via userinfo. Returns
   * `undefined` when the userinfo index hasn't caught up yet (rare —
   * happens only if a Player is read in the same tick the entity was
   * created, before the userinfo string-table update for that slot).
   *
   * Live read — observes the latest userinfo state. Two reads in different
   * ticks may return different values (e.g. a player rename via console).
   *
   * Resolution path: `entitySlot = slot - 1` per CSGO convention →
   * `userIdForEntitySlot` → `infoForUserId.name`. Nothing cached: the
   * underlying `UserInfoIndex` already memoises per-slot decode and the
   * map lookups are O(1).
   */
  get name(): string | undefined {
    if (this.userInfoIndex === undefined) return undefined;
    const userId = this.userInfoIndex.userIdForEntitySlot(this.slot - 1);
    if (userId === undefined) return undefined;
    return this.userInfoIndex.infoForUserId(userId)?.name;
  }

  /**
   * Steam ID as a `SteamId` instance, or `undefined` when userinfo isn't
   * available yet for this slot. Use `steamId.toSteam2()`, `.toSteam3()`,
   * or `.toSteam64()` to project to the form your tooling expects.
   *
   * Bot players carry `xuid: "0"` from the engine and resolve to a
   * `SteamId` with `accountId === 0`. Live read — same liveness story as
   * `name`: a fresh `SteamId` is constructed on every call against the
   * current userinfo state.
   */
  get steamId(): SteamId | undefined {
    if (this.userInfoIndex === undefined) return undefined;
    const userId = this.userInfoIndex.userIdForEntitySlot(this.slot - 1);
    if (userId === undefined) return undefined;
    const info = this.userInfoIndex.infoForUserId(userId);
    if (info === undefined) return undefined;
    return SteamId.fromSteam64(info.xuid);
  }

  /**
   * Capture the current values into a frozen plain object. Use this when
   * deferring processing past the next tick — the live overlay's getters
   * would otherwise re-read updated state on the deferred read.
   */
  snapshot(): PlayerSnapshot {
    return Object.freeze({
      slot: this.slot,
      team: this.team,
      health: this.health,
      money: this.money,
      position: this.position,
      viewAngle: this.viewAngle,
      isAlive: this.isAlive,
      activeWeaponHandle: this.activeWeaponHandle,
      name: this.name,
      steamId: this.steamId,
    });
  }
}
