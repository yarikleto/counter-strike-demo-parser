/**
 * Weapon — typed overlay onto a `CWeaponCSBase`-rooted Entity.
 *
 * One of the four typed overlays specified by ADR-004. Pattern, in brief:
 *
 *   - Live view: every getter re-reads through the underlying `Entity`'s
 *     `EntityStore` slot. No per-getter cache — the latest tick's value
 *     wins automatically.
 *   - Per-instance flat-prop index cache: the constructor walks the
 *     ServerClass's `flattenedProps` once to resolve the integer index of
 *     each prop we care about, then the hot-path getter is a single
 *     `store.read(slot, idx)` typed-array dereference. We do NOT route
 *     through `entity.propByName` on every call — that would be a `Map.get`
 *     per read on a multi-million-call path.
 *   - Loud failure on schema mismatch: if any required prop is missing from
 *     the entity's `flattenedProps`, the constructor throws. This is a
 *     "broken, not missing" condition (per ADR-004) — it means the demo
 *     declared a weapon class whose SendTable lacks ammo/owner props,
 *     which is a parser-level invariant violation, not a normal
 *     transient-state case.
 *   - Snapshot escape hatch: `snapshot()` returns a frozen plain object
 *     for callers who want to retain values past the next tick.
 *
 * This class does NOT try to detect "is this entity actually a weapon" —
 * the caller is expected to filter by `entity.serverClass.className`
 * (e.g., `CAK47`, `CDEagle`, …) before constructing the overlay. We also
 * do NOT resolve `ownerHandle` to a `Player`; handle resolution requires
 * a live `EntityList` reference and that wiring is the caller's job.
 *
 * The five cached varNames are taken verbatim from the de_nuke flat-prop
 * dump for `CWeaponFamas` (representative of every CWeapon* subclass):
 *
 *   - `m_hOwnerEntity`             (DT_BaseEntity,         idx 439)
 *   - `m_iClip1`                   (DT_BaseCombatWeapon,   idx 497)
 *   - `m_iClip2`                   (DT_BaseCombatWeapon,   idx 498)
 *   - `m_iPrimaryReserveAmmoCount` (DT_BaseCombatWeapon,   idx 499)
 *   - `m_iItemDefinitionIndex`    (DT_ScriptCreatedItem,   idx 402)
 *
 * Although `m_iItemDefinitionIndex` is *defined* under the weapon's
 * attribute-manager-econ-item subtree (`m_AttributeManager.m_Item.*`), the
 * Flattener emits the bare on-wire varName — flattening collapses the
 * dotted path. The bare name is what the runtime schema actually carries.
 */
import type { Entity } from "../entities/Entity.js";

/**
 * Frozen, point-in-time view of the weapon's networked state. Use when the
 * value must outlive the current tick (logging, IPC, deferred processing).
 *
 * `ownerHandle` is the raw handle integer. Resolution to a `Player` /
 * `Entity` lives outside this class — the overlay deliberately has no
 * access to `EntityList`, keeping the projection layer free of upward
 * dependencies.
 */
export interface WeaponSnapshot {
  /** Underlying entity's C++ class name, e.g. `CAK47`, `CDEagle`. */
  readonly className: string;
  /** Currently-loaded primary magazine count (`m_iClip1`). */
  readonly clip1: number;
  /** Currently-loaded secondary magazine count (`m_iClip2`). */
  readonly clip2: number;
  /** Reserve ammo carried for the primary fire mode. */
  readonly reserveAmmo: number;
  /** Econ item definition index — identifies the weapon model (AK = 7, …). */
  readonly itemDefIndex: number;
  /** Raw owner handle. May be `INVALID_HANDLE` for dropped weapons. */
  readonly ownerHandle: number;
}

export class Weapon {
  private readonly entity: Entity;

  // Cached flat-prop indices (resolved once at construction). Reading the
  // same props by name on every getter would re-dereference the
  // ServerClass-level Map cache — fine, but a typed-array dereference is
  // cheaper and there's no reason not to cache once.
  private readonly ownerHandleIdx: number;
  private readonly clip1Idx: number;
  private readonly clip2Idx: number;
  private readonly reserveAmmoIdx: number;
  private readonly itemDefIndexIdx: number;

  constructor(entity: Entity) {
    this.entity = entity;

    const findIdx = (name: string): number => {
      const idx = entity.serverClass.flattenedProps.findIndex(
        (p) => p.prop.varName === name,
      );
      if (idx < 0) {
        throw new Error(
          `Weapon overlay: prop "${name}" not in ${entity.serverClass.className} schema`,
        );
      }
      return idx;
    };

    this.ownerHandleIdx = findIdx("m_hOwnerEntity");
    this.clip1Idx = findIdx("m_iClip1");
    this.clip2Idx = findIdx("m_iClip2");
    this.reserveAmmoIdx = findIdx("m_iPrimaryReserveAmmoCount");
    this.itemDefIndexIdx = findIdx("m_iItemDefinitionIndex");
  }

  /**
   * Read a numeric prop by cached index, defaulting unwritten/non-numeric
   * reads to 0.
   *
   * `EntityStore.read` returns `undefined` for never-written props. We
   * fold that into 0 because all the weapon props we read are integers
   * with a sensible "absent" zero value (no clip, no ammo, no item def,
   * no owner = `INVALID_HANDLE`/0). The `typeof` guard also defends
   * against future schema drift where a varName might collide with a
   * non-numeric prop on some weapon subclass — we'd return 0 rather
   * than crash on `value as number` arithmetic downstream.
   */
  private readNum(idx: number): number {
    const v = this.entity.store.read(this.entity.storageSlot, idx);
    return typeof v === "number" ? v : 0;
  }

  /** C++ class name of the underlying entity, e.g. `CAK47`. */
  get className(): string {
    return this.entity.serverClass.className;
  }

  /** Primary magazine count (current rounds loaded). */
  get clip1(): number {
    return this.readNum(this.clip1Idx);
  }

  /** Secondary magazine count. */
  get clip2(): number {
    return this.readNum(this.clip2Idx);
  }

  /** Reserve ammo carried for the primary fire mode. */
  get reserveAmmo(): number {
    return this.readNum(this.reserveAmmoIdx);
  }

  /** Econ item definition index — identifies the weapon model. */
  get itemDefIndex(): number {
    return this.readNum(this.itemDefIndexIdx);
  }

  /**
   * Raw owner handle. Resolution is the caller's job — the overlay has
   * no `EntityList` reference by design (see ADR-004).
   */
  get ownerHandle(): number {
    return this.readNum(this.ownerHandleIdx);
  }

  /**
   * Frozen point-in-time copy. Use when the values must survive past the
   * next tick — every other read should go through the live getters so
   * the freshest value is observed.
   */
  snapshot(): WeaponSnapshot {
    return Object.freeze({
      className: this.className,
      clip1: this.clip1,
      clip2: this.clip2,
      reserveAmmo: this.reserveAmmo,
      itemDefIndex: this.itemDefIndex,
      ownerHandle: this.ownerHandle,
    });
  }
}
