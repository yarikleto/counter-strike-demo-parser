/**
 * Entity — lazy view onto a per-class storage slot.
 *
 * An Entity is a thin handle: `(serverClass, entityId, storageSlot,
 * capturedVersion)`. All property reads route through the underlying
 * `EntityStore`. The `capturedVersion` field is the slot's version counter
 * at construction time — every read compares it against the store's
 * current version and throws `StaleEntityError` on mismatch. This is the
 * loud-failure mechanism for consumers who hold a reference past a delete
 * and slot reuse.
 *
 * Per ADR-002 amendment + TASK-026 brief Section 3:
 *   - No prop array allocation per event emission. The view is allocated
 *     once at create-time and reused across `entityCreated` / `entityUpdated`
 *     emissions for the same id+class lifetime; on delete, a NEW view is
 *     allocated for the next entity at that id (with a fresh version
 *     baseline) so the old view's stale-detection still fires.
 *   - `propByName` caches the name-to-index mapping on the ServerClass on
 *     first call so subsequent lookups are O(1). Cache key is the prop's
 *     `varName`; collisions across tables (rare but legal) resolve to the
 *     first match by flat-prop index.
 */
import type { ServerClass } from "../datatables/ServerClass.js";
import type { PropertyValue } from "../properties/Property.js";
import type { EntityStore } from "./EntityStore.js";
import { StaleEntityError } from "./errors.js";

/**
 * A consumer-visible entity. Identity (`id`, `serverClass`, `serialNumber`,
 * `state`) is plain fields; property reads dispatch to storage via `prop()`
 * / `propByName()`.
 */
export class Entity {
  /**
   * Wire-level entity index — the dense `entityId` slot in `EntityList`,
   * range `[0, MAX_EDICTS)`. Stable for the entity's lifetime; reused for
   * a different entity after a delete (with a fresh `serialNumber` and an
   * advanced storage version that invalidates any stale view).
   *
   * On CCSPlayer entities this happens to match the player's 1-based
   * connection slot — the canonical bridge `Player.slot === entity.id`.
   */
  readonly id: number;
  /**
   * The networked C++ class registered for this entity. Carries the
   * `className` (e.g. `"CCSPlayer"`), the root `dtName`, and the
   * flattened decode template the property accessors index into.
   */
  readonly serverClass: ServerClass;
  /**
   * Per-slot serial number assigned at create time. Combined with `id`
   * to form an entity handle; gates `resolveHandle` so a handle issued
   * before a delete-and-reuse cycle resolves to `undefined` rather than
   * silently picking up the new occupant.
   */
  readonly serialNumber: number;
  /**
   * Lifecycle phase of the entity:
   *   - `"active"`  — present in PVS, all property reads valid.
   *   - `"dormant"` — left PVS but storage preserved; reads return the
   *                   last-known value (no event fires for re-entries).
   *   - `"free"`    — slot has been freed; the view is stale and any
   *                   property read throws `StaleEntityError`.
   * Mutated by `EntityList` as PacketEntities decode reaches PVS-leave /
   * delete transitions.
   */
  state: "active" | "dormant" | "free";

  /** @internal The ServerClass's storage bundle. Exposed for EntityList. */
  readonly store: EntityStore;
  /** @internal The slot index within `store`. */
  readonly storageSlot: number;
  /** @internal Slot version at construction — gates staleness checks. */
  private readonly capturedVersion: number;

  constructor(
    id: number,
    serverClass: ServerClass,
    serialNumber: number,
    store: EntityStore,
    storageSlot: number,
  ) {
    this.id = id;
    this.serverClass = serverClass;
    this.serialNumber = serialNumber;
    this.state = "active";
    this.store = store;
    this.storageSlot = storageSlot;
    this.capturedVersion = store.getVersion(storageSlot);
  }

  /** Read by flat-prop index. Returns undefined for never-written props. */
  prop(index: number): PropertyValue | undefined {
    this.assertFresh();
    return this.store.read(this.storageSlot, index);
  }

  /** Read by SendProp varName. O(propCount) first call per name; cached. */
  propByName(name: string): PropertyValue | undefined {
    this.assertFresh();
    const idx = lookupIndex(this.serverClass, name);
    if (idx === undefined) return undefined;
    return this.store.read(this.storageSlot, idx);
  }

  /** Iterate (index, value) for written props only. */
  *entries(): IterableIterator<readonly [number, PropertyValue]> {
    this.assertFresh();
    const total = this.serverClass.flattenedProps.length;
    for (let i = 0; i < total; i++) {
      const v = this.store.read(this.storageSlot, i);
      if (v !== undefined) yield [i, v];
    }
  }

  private assertFresh(): void {
    const current = this.store.getVersion(this.storageSlot);
    if (current !== this.capturedVersion) {
      throw new StaleEntityError(this.id, this.capturedVersion, current);
    }
  }
}

/**
 * varName-to-flatPropIndex cache. Lazily populated on first lookup per
 * ServerClass.
 *
 * Caches are keyed by the ServerClass instance (WeakMap) so per-parser-
 * lifetime caches are GC'd alongside the parser. The cache value is a
 * plain object — collisions across tables (e.g., the same `m_iHealth`
 * appearing in both `DT_BasePlayer` and `DT_BCCLocalPlayerExclusive`)
 * resolve to the first occurrence in flat-prop order, which matches the
 * server's prop-priority ordering (the more-specific overlay wins by
 * appearing later, so we want the FIRST hit; demoinfocs uses the same
 * convention).
 */
const nameIndexCache = new WeakMap<ServerClass, Map<string, number>>();

function lookupIndex(
  serverClass: ServerClass,
  name: string,
): number | undefined {
  let cache = nameIndexCache.get(serverClass);
  if (cache === undefined) {
    cache = new Map<string, number>();
    const props = serverClass.flattenedProps;
    for (let i = 0; i < props.length; i++) {
      const p = props[i]!;
      if (!cache.has(p.prop.varName)) {
        cache.set(p.prop.varName, i);
      }
    }
    nameIndexCache.set(serverClass, cache);
  }
  return cache.get(name);
}
