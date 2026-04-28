/**
 * EntityList — top-level entity-id → Entity routing.
 *
 * Per ADR-002 amendment: entity ids (0..MAX_EDICTS-1, on the wire) are
 * routed to a per-class storage slot inside the relevant ServerClass's
 * `EntityStore`. The mapping `entityId -> { entityView }` lives here. The
 * View carries enough info to look up its own storage slot — see
 * Entity.ts.
 *
 * This class is a registry: it does not decode bits, does not consult
 * baselines, does not emit events. It is the storage routing layer the
 * decoder writes to. The decoder owns the bit stream; this class owns the
 * id-to-slot fan-out.
 */
import type { ServerClass } from "../datatables/ServerClass.js";
import { Entity } from "./Entity.js";
import { EntityStore } from "./EntityStore.js";
import { computePropColumns, type PropColumnLayout } from "./PropColumns.js";
import { EntityClassMismatchError } from "./errors.js";

/** Source's hard cap: 2048 networked entity slots. */
export const MAX_EDICTS = 2048;

export class EntityList {
  /** entityId → live Entity view, or undefined for free slots. */
  private readonly slots: (Entity | undefined)[] = new Array(MAX_EDICTS);

  /** Look up the live entity at an id. Returns undefined for free slots. */
  get(id: number): Entity | undefined {
    if (id < 0 || id >= MAX_EDICTS) return undefined;
    return this.slots[id];
  }

  /**
   * Number of live (allocated) entities. O(MAX_EDICTS) — only used by
   * tests and integration assertions, not on the hot path.
   */
  get size(): number {
    let n = 0;
    for (const s of this.slots) {
      if (s !== undefined) n += 1;
    }
    return n;
  }

  /** Iterate over every live (id, entity) pair in id order. */
  *entries(): IterableIterator<readonly [number, Entity]> {
    for (let i = 0; i < this.slots.length; i++) {
      const e = this.slots[i];
      if (e !== undefined) yield [i, e];
    }
  }

  /**
   * Allocate a fresh entity at `id` for ServerClass `serverClass` with
   * serial `serialNumber`. If a slot already exists at `id`:
   *   - same class: free the old storage slot, allocate a new one — the
   *     new entity is observably a fresh instance.
   *   - different class: throw `EntityClassMismatchError` per ADR-002
   *     amendment (forbidden by parser policy).
   *
   * The new Entity is registered at `slots[id]` and returned. The caller
   * (PacketEntitiesDecoder) is responsible for applying the baseline and
   * the create-delta props after.
   */
  create(
    id: number,
    serverClass: ServerClass,
    serialNumber: number,
  ): Entity {
    const existing = this.slots[id];
    if (existing !== undefined) {
      if (existing.serverClass.classId !== serverClass.classId) {
        throw new EntityClassMismatchError(
          id,
          existing.serverClass.classId,
          serverClass.classId,
        );
      }
      // Same class: free old slot to that class's freelist, then allocate
      // fresh. The Entity view's slot version captures the fresh version.
      existing.store.free(existing.storageSlot);
    }
    const store = ensureStore(serverClass);
    const slot = store.allocate();
    const entity = new Entity(id, serverClass, serialNumber, store, slot);
    this.slots[id] = entity;
    return entity;
  }

  /**
   * Free the entity at `id`. The Entity view becomes stale immediately —
   * any subsequent read on a still-held reference throws StaleEntityError.
   *
   * Callers that need to read final values from the deleted entity must
   * do so synchronously inside the `entityDeleted` listener — the parser
   * emits the event with the view BEFORE the slot version bump completes
   * (the bump happens inside `EntityStore.free`, but we emit the event
   * via the decoder's emit callback before calling delete).
   *
   * Returns the deleted Entity, or undefined if the slot was already free.
   */
  delete(id: number): Entity | undefined {
    const entity = this.slots[id];
    if (entity === undefined) return undefined;
    entity.store.free(entity.storageSlot);
    entity.state = "free";
    this.slots[id] = undefined;
    return entity;
  }

  /**
   * Mark the entity at `id` as dormant (left PVS). Storage is preserved —
   * last-known values remain readable for M3 state overlays. No event is
   * emitted in M2; TASK-027 may add `entityLeftPVS` as a follow-up.
   *
   * Returns the dormant Entity, or undefined if the slot was empty.
   */
  leavePVS(id: number): Entity | undefined {
    const entity = this.slots[id];
    if (entity === undefined) return undefined;
    entity.state = "dormant";
    return entity;
  }
}

/**
 * Lazy-allocate the EntityStore for a ServerClass on first instantiation.
 * Idempotent: subsequent calls return the same instance.
 *
 * The cast through `unknown` is the negotiated boundary between the
 * datatables layer (which holds the forward-declared `EntityStoreRef`) and
 * the entity layer (the only writer).
 */
export function ensureStore(serverClass: ServerClass): EntityStore {
  if (serverClass.entityStore !== null) {
    return serverClass.entityStore as EntityStore;
  }
  let layout = serverClass.propColumnLayout as PropColumnLayout | null;
  if (layout === null) {
    layout = computePropColumns(serverClass.flattenedProps);
    serverClass.propColumnLayout = layout;
  }
  const store = new EntityStore(serverClass, layout);
  serverClass.entityStore = store;
  return store;
}
