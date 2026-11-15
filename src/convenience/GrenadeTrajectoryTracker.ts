/**
 * GrenadeTrajectoryTracker — reconstructs the full in-flight path of every
 * grenade projectile in a demo, from spawn to detonation.
 *
 * Why this exists: Tier-1 enrichers (TASK-041) surface where a grenade was
 * thrown from (`grenade_thrown`) and where it detonated (`*_detonate`), but
 * not the bouncing arc in between. Smoke-line review, lineup analytics, and
 * trajectory heatmaps all need the per-tick position samples — which only
 * exist as `m_vecOrigin` updates on the projectile entity itself. This
 * tracker bridges that gap by attaching to entity-lifecycle events and
 * accumulating positions for the lifetime of every projectile.
 *
 * Detection strategy — class-based:
 *   The CSGO server networks an in-flight grenade as one of four projectile
 *   ServerClasses (verified empirically on de_nuke.dem):
 *     - `CBaseCSGrenadeProjectile`  → HE or flashbang (ambiguous at spawn)
 *     - `CSmokeGrenadeProjectile`   → smoke
 *     - `CMolotovProjectile`        → molotov (or incendiary)
 *     - `CDecoyProjectile`          → decoy
 *   `CInferno` (the fire-on-ground volume) is intentionally NOT tracked —
 *   it is not a thrown projectile, it's the post-detonation effect.
 *
 *   `CBaseCSGrenadeProjectile` covers BOTH HE and flashbang: the class is
 *   shared and the only reliable disambiguator is the matching detonate
 *   event (`hegrenade_detonate` vs `flashbang_detonate`), which carries the
 *   same `entityid` as the projectile entity. The default at spawn is
 *   `'he'`; the type is rewritten when the detonate event arrives.
 *
 *   Until then the projectile's model (`m_nModelIndex` → modelprecache,
 *   `…flashbang…` vs `…fraggrenade…`) gives the type, so throws whose
 *   detonation is never seen are still typed correctly.
 *
 *   `CMolotovProjectile` serves both molotov and incendiary; the
 *   `m_bIsIncGrenade` prop on `DT_MolotovProjectile` tells them apart.
 *
 * Thrower resolution:
 *   Read `m_hThrower` (Source 21-bit packed entity handle on the
 *   `DT_BaseGrenade` table — see `EntityHandle.ts`) at create time and
 *   resolve to a CCSPlayer via `resolveHandle`, then capture the matching
 *   `Player` as a plain `PlayerRef` (plus their position, the throw
 *   position). Read once at spawn — the thrower doesn't change
 *   mid-flight. Returns `undefined` for grenades whose thrower can't be
 *   resolved (slot reuse, disconnect-mid-flight, world-spawned debug
 *   grenades, dropped→retriggered grenades whose handle has gone stale).
 *
 * Trajectory sampling:
 *   On every `entityUpdated` for a tracked projectile, read its world-space
 *   origin (`m_vecOrigin` is cell-relative on projectiles and is combined
 *   with `m_cellX/Y/Z` — see `EntityOrigin.ts`) and push to the trajectory iff
 *   the position differs from the last sample. CSGO networks
 *   `m_flSimulationTime` and `m_vecOrigin` together so the entity update
 *   typically fires once per tick the grenade moves — duplicate samples
 *   are still rare but the equality guard keeps the array tight.
 *
 *   The tracker does not throttle by tick; it relies on the server's own
 *   network update cadence (typically 64 Hz) for sample density. A 3-second
 *   smoke arc therefore yields ~190 samples, well within memory budgets.
 *
 * Detonation capture:
 *   Subscribe to the Tier-2 `gameEvent` catch-all and inspect raw events
 *   named `hegrenade_detonate`, `flashbang_detonate`, `smokegrenade_detonate`,
 *   `molotov_detonate`, `decoy_detonate`. Each carries `entityid`, `x`, `y`,
 *   `z` (verified on the descriptor probe). When `entityid` matches a
 *   tracked projectile, write `detonationPosition` and `detonationTick`
 *   AND finalize the type (override the class-based default with the
 *   event-derived value: HE vs flash, molotov verified). Tier-2 is used
 *   here rather than the Tier-1 enrichers because the Tier-1 enriched
 *   events drop `entityid` (see `heGrenadeDetonate.ts` rationale).
 *
 *   `inferno_expire` and `smokegrenade_expired` are NOT used — they fire
 *   on the post-detonation volume (Inferno entity, smoke effect), not the
 *   projectile itself, and have already been preceded by the matching
 *   detonate event.
 *
 * Entity deletion fallback:
 *   On `entityDeleted` for a tracked projectile that never received a
 *   detonate event (e.g. dropped at round end, deleted before the
 *   matching detonate fires due to tick boundaries), the trajectory is
 *   still kept — `detonationPosition` and `detonationTick` simply remain
 *   `undefined`.
 *
 * Memory & streaming discipline:
 *   The tracker holds one `MutableTrajectory` per grenade for the duration
 *   of the parse. A 30-round competitive demo has ~300 grenades → trivial
 *   memory. We do NOT retain entity references after parse completes; the
 *   final `snapshot()` returns frozen records with plain `Vector3` points.
 */

import type { DemoParser } from "../DemoParser.js";
import type { Player, Vector3 } from "../state/Player.js";
import { PlayerRoster, plainVector } from "./PlayerRoster.js";
import type { PlayerRef } from "./PlayerRoster.js";
import type { Entity } from "../entities/Entity.js";
import type { DecodedGameEvent } from "../events/GameEventDecoder.js";
import { resolveHandle } from "../state/EntityHandle.js";
import { readEntityOrigin } from "../state/EntityOrigin.js";

/** The five distinguishable in-flight grenade types. */
export type GrenadeType = "smoke" | "flash" | "he" | "molotov" | "incendiary" | "decoy";

/** A single trajectory sample: world-space position at a frame tick. */
export interface TrajectoryPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Frame tick at which this sample was captured (`DemoParser.currentTick`). */
  readonly tick: number;
}

/**
 * Reconstructed trajectory for a single grenade.
 *
 * `entityIndex` identifies the projectile entity within the demo — it is
 * the same id carried on `*_detonate` events' `entityid` field.
 *
 * Returned trajectories are frozen on `snapshot()`; consumers can hold
 * references past the parse without risking mutation.
 */
export interface GrenadeTrajectory {
  /** The throwing player, or `undefined` if the thrower can't be resolved. */
  readonly thrower: PlayerRef | undefined;
  /** The thrower's position at the throw tick. */
  readonly throwerPosition: Vector3 | undefined;
  /** Grenade type as inferred from class + matching detonate event. */
  readonly type: GrenadeType;
  /** Per-tick position samples in flight order. Frozen. */
  readonly trajectory: readonly TrajectoryPoint[];
  /**
   * World-space position at detonation. `undefined` when the projectile
   * was deleted without a matching detonate event (rare — happens on
   * grenades that survive into round-end cleanup, on tick boundaries, or
   * for `CMolotovProjectile`s on demos that omit the molotov_detonate
   * event for that throw).
   */
  readonly detonationPosition: Vector3 | undefined;
  /** Projectile entity id (same as `*_detonate` event `entityid`). */
  readonly entityIndex: number;
  /** Frame tick at which the projectile entity was created. */
  readonly throwTick: number;
  /** Frame tick at detonation, or `undefined` if no detonate event was matched. */
  readonly detonationTick: number | undefined;
}

/**
 * In-progress mutable record. Promoted to the public read-only form on
 * `snapshot()`. Kept internal so the public type can stay strictly readonly
 * without leaking the assembly path.
 */
interface MutableTrajectory {
  thrower: PlayerRef | undefined;
  throwerPosition: Vector3 | undefined;
  type: GrenadeType;
  trajectory: TrajectoryPoint[];
  detonationPosition: Vector3 | undefined;
  entityIndex: number;
  throwTick: number;
  detonationTick: number | undefined;
  /** Last sampled position — used to suppress duplicate consecutive samples. */
  lastX: number;
  lastY: number;
  lastZ: number;
  /** Has at least one sample been pushed? Avoids the 0/0/0 edge case. */
  hasSample: boolean;
}

/** ServerClass names that map directly to a single grenade type at spawn. */
const PROJECTILE_CLASS_TO_TYPE: Readonly<Record<string, GrenadeType>> = {
  CSmokeGrenadeProjectile: "smoke",
  CMolotovProjectile: "molotov",
  CDecoyProjectile: "decoy",
  // CBaseCSGrenadeProjectile is HE or flash — defaults to "he" until the
  // matching detonate event finalizes the type. Resolved separately below
  // because the lookup is special-cased.
  CBaseCSGrenadeProjectile: "he",
};

/** Detonate-event names that carry an `entityid` we can correlate against. */
const DETONATE_EVENT_TO_TYPE: Readonly<Record<string, GrenadeType>> = {
  hegrenade_detonate: "he",
  flashbang_detonate: "flash",
  smokegrenade_detonate: "smoke",
  molotov_detonate: "molotov",
  decoy_detonate: "decoy",
};

/**
 * Convenience-layer grenade trajectory tracker.
 *
 * Attach to a `DemoParser` before `parseAll()` and call `snapshot()` after
 * parsing to retrieve the list of `GrenadeTrajectory` records.
 *
 * @example
 * ```ts
 * const tracker = new GrenadeTrajectoryTracker();
 * tracker.attach(parser);
 * parser.parseAll();
 *
 * for (const t of tracker.snapshot()) {
 *   console.log(t.type, t.thrower?.slot, "samples:", t.trajectory.length);
 * }
 * ```
 */
export class GrenadeTrajectoryTracker {
  /** entityIndex → in-progress record. Live for the duration of the parse. */
  private readonly tracked = new Map<number, MutableTrajectory>();
  /** Completed records (entity deleted or detonated), in order of completion. */
  private readonly completed: MutableTrajectory[] = [];
  /** Reference kept so handlers can read live parser state. */
  private parser: DemoParser | null = null;
  private roster: PlayerRoster | null = null;

  /**
   * Wire the tracker to a parser by subscribing to the entity-lifecycle and
   * Tier-2 game-event surfaces. Must be called before `parser.parseAll()`.
   */
  attach(parser: DemoParser): void {
    this.parser = parser;
    this.roster = PlayerRoster.for(parser);
    parser.on("entityCreated", (e) => this.onEntityCreated(e));
    parser.on("entityUpdated", (e) => this.onEntityUpdated(e));
    parser.on("entityDeleted", (e) => this.onEntityDeleted(e));
    parser.on("gameEvent", (e) => this.onGameEvent(e));
  }

  /**
   * Return the accumulated trajectories. Each record is frozen along with
   * its trajectory array and detonation-position object, so consumers can
   * safely retain references past the parse.
   *
   * Includes both completed (detonated or deleted) and still-active
   * trajectories. On a well-formed demo every projectile is deleted before
   * `dem_stop`, so the still-active list is empty in practice.
   */
  snapshot(): readonly GrenadeTrajectory[] {
    const all: MutableTrajectory[] = [...this.completed, ...this.tracked.values()];
    return Object.freeze(all.map(toFrozen));
  }

  // ---------------------------------------------------------------------------
  // Event handlers — called synchronously during parseAll()
  // ---------------------------------------------------------------------------

  private onEntityCreated(entity: Entity): void {
    const className = entity.serverClass.className;
    const type = PROJECTILE_CLASS_TO_TYPE[className];
    if (type === undefined) return;

    const thrower = this.resolveThrower(entity);
    const tick = this.parser!.currentTick;

    const record: MutableTrajectory = {
      thrower: thrower !== undefined ? this.roster!.ref(thrower) : undefined,
      throwerPosition: thrower !== undefined ? plainVector(thrower.position) : undefined,
      type: this.refineType(entity, type),
      trajectory: [],
      detonationPosition: undefined,
      entityIndex: entity.id,
      throwTick: tick,
      detonationTick: undefined,
      lastX: 0,
      lastY: 0,
      lastZ: 0,
      hasSample: false,
    };
    this.tracked.set(entity.id, record);

    // Push the spawn position as the first sample so the trajectory always
    // starts at the throw origin even if the entity is detonated on the
    // same tick (no entityUpdated fires).
    this.sampleOrigin(entity, record, tick);
  }

  private onEntityUpdated(entity: Entity): void {
    const record = this.tracked.get(entity.id);
    if (record === undefined) return;
    this.sampleOrigin(entity, record, this.parser!.currentTick);
  }

  private onEntityDeleted(entity: Entity): void {
    const record = this.tracked.get(entity.id);
    if (record === undefined) return;
    // Move from active to completed. The entity may have been deleted
    // without a matching detonate event (round-end cleanup, dropped
    // grenades, edge cases) — leave detonationPosition / detonationTick
    // as undefined in that case.
    this.tracked.delete(entity.id);
    this.completed.push(record);
  }

  private onGameEvent(e: DecodedGameEvent): void {
    const finalType = DETONATE_EVENT_TO_TYPE[e.name];
    if (finalType === undefined) return;

    const entityid = e.data.entityid;
    if (typeof entityid !== "number" || entityid <= 0) return;

    const record = this.tracked.get(entityid);
    if (record === undefined) return;

    // Capture detonation snapshot. The `*_detonate` event's x/y/z fields
    // are the world-space position; coerce defensively (the descriptor
    // declares them as floats but we never assume).
    const x = typeof e.data.x === "number" ? e.data.x : 0;
    const y = typeof e.data.y === "number" ? e.data.y : 0;
    const z = typeof e.data.z === "number" ? e.data.z : 0;
    record.detonationPosition = Object.freeze({ x, y, z });
    record.detonationTick = this.parser!.currentTick;
    // Override the class-based default with the event-derived type. This
    // is the disambiguation step for CBaseCSGrenadeProjectile (HE vs flash).
    // molotov_detonate cannot tell incendiaries apart; keep the prop-based type.
    if (!(finalType === "molotov" && record.type === "incendiary")) record.type = finalType;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Spawn-time type refinement: `m_bIsIncGrenade` splits molotov from
   * incendiary, and the model splits flash from HE. A later detonate event
   * still has the final word.
   */
  private refineType(entity: Entity, type: GrenadeType): GrenadeType {
    if (type === "molotov") {
      return readProp(entity, "m_bIsIncGrenade") === 1 ? "incendiary" : "molotov";
    }
    if (type === "he") {
      const model = readProp(entity, "m_nModelIndex");
      const path = typeof model === "number" ? this.parser!.modelPrecache.get(model) : undefined;
      if (path?.includes("flashbang") === true) return "flash";
    }
    return type;
  }

  /**
   * Resolve the projectile's thrower via `m_hThrower`. The handle is in the
   * 21-bit packed SendProp form (10-bit serial | 11-bit index) — the same
   * form used by `m_hOwnerEntity` and `m_hActiveWeapon`. Returns
   * `undefined` when the handle is invalid, the slot is empty, or the
   * resolved entity isn't a CCSPlayer with a live overlay.
   */
  private resolveThrower(entity: Entity): Player | undefined {
    const handleIdx = entity.serverClass.flattenedProps.findIndex(
      (p) => p.prop.varName === "m_hThrower",
    );
    if (handleIdx < 0) return undefined;
    const handle = entity.store.read(entity.storageSlot, handleIdx);
    if (typeof handle !== "number") return undefined;

    const throwerEntity = resolveHandle(this.parser!.entities, handle);
    if (throwerEntity === undefined) return undefined;
    if (throwerEntity.serverClass.className !== "CCSPlayer") return undefined;

    // Match by entity id — Player.slot is the CCSPlayer entity id.
    for (const p of this.parser!.players) {
      if (p.slot === throwerEntity.id) return p;
    }
    return undefined;
  }

  /**
   * Read the projectile's world-space origin and push a sample if it differs
   * from the last one. Projectiles network `m_vecOrigin` as a cell-relative
   * offset; {@link readEntityOrigin} combines it with `m_cellX/Y/Z` into
   * world coordinates (the same space as `Player.position`).
   */
  private sampleOrigin(entity: Entity, record: MutableTrajectory, tick: number): void {
    const v = readEntityOrigin(entity);
    // Origin not yet written — entity created from baseline only on this
    // tick. Skip; the next entityUpdated will carry it.
    if (v === undefined) return;

    // Suppress duplicate consecutive samples — the server occasionally
    // re-emits an unchanged origin in the same prop bundle as another
    // changed prop on the entity.
    if (record.hasSample && v.x === record.lastX && v.y === record.lastY && v.z === record.lastZ) {
      return;
    }

    record.trajectory.push(Object.freeze({ x: v.x, y: v.y, z: v.z, tick }));
    record.lastX = v.x;
    record.lastY = v.y;
    record.lastZ = v.z;
    record.hasSample = true;
  }
}

/** Read a prop by name straight from the store (no staleness check needed at spawn). */
function readProp(entity: Entity, name: string): unknown {
  const idx = entity.serverClass.flattenedProps.findIndex((p) => p.prop.varName === name);
  return idx < 0 ? undefined : entity.store.read(entity.storageSlot, idx);
}

/**
 * Promote a mutable record to a frozen public-typed `GrenadeTrajectory`.
 * Freezing the trajectory array guards against accidental post-snapshot
 * mutation by consumers — the points themselves were already frozen at
 * push time.
 */
function toFrozen(r: MutableTrajectory): GrenadeTrajectory {
  return Object.freeze({
    thrower: r.thrower,
    throwerPosition: r.throwerPosition,
    type: r.type,
    trajectory: Object.freeze(r.trajectory.slice()),
    detonationPosition: r.detonationPosition,
    entityIndex: r.entityIndex,
    throwTick: r.throwTick,
    detonationTick: r.detonationTick,
  });
}
