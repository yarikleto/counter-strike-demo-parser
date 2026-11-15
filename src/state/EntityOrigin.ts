/**
 * EntityOrigin — world-space origin of a non-player entity.
 *
 * Most CS:GO entities (grenade projectiles, the planted C4, infernos,
 * hostages, dropped weapons) network their position through
 * `DT_BaseEntity` using Source's *cell* encoding:
 *
 *   - `m_cellbits`            — log2 of the cell width (typically 5 → 32 units)
 *   - `m_cellX/Y/Z`           — integer cell index per axis
 *   - `m_vecOrigin`           — offset inside the cell (`SPROP_CELL_COORD`),
 *                               so its components are small (0..cellWidth)
 *
 * The world coordinate per axis is
 *
 *   world = cell * cellWidth - MAX_COORD_INTEGER + offset
 *
 * which is exactly what demoinfocs-golang computes in `entity.Position()`
 * (`coordFromCell`). Reading `m_vecOrigin` alone yields cell-relative values
 * such as (11, 4, 6) instead of world coordinates such as (-2426, -1400, 12).
 *
 * CCSPlayer is the exception: it networks a full-precision origin via
 * `DT_CS(Non)LocalPlayerExclusive` — see `Player.position`.
 */
import type { Entity } from "../entities/Entity.js";
import type { ServerClass } from "../datatables/ServerClass.js";
import type { Vector3 } from "./Player.js";

/** Source's MAX_COORD_INTEGER: the world spans [-16384, 16384) per axis. */
export const MAX_COORD_INTEGER = 16384;

/** Flat-prop indices needed to resolve an origin. `-1` = absent from the schema. */
interface OriginLayout {
  readonly origin: number;
  readonly cellBits: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly cellZ: number;
}

const layoutCache = new WeakMap<ServerClass, OriginLayout>();

function layoutFor(serverClass: ServerClass): OriginLayout {
  let layout = layoutCache.get(serverClass);
  if (layout === undefined) {
    let origin = -1;
    let cellBits = -1;
    let cellX = -1;
    let cellY = -1;
    let cellZ = -1;
    const props = serverClass.flattenedProps;
    for (let i = 0; i < props.length; i++) {
      // First match wins — `m_vecOrigin` lives on DT_BaseEntity, which is
      // flattened ahead of any subclass table.
      switch (props[i]!.prop.varName) {
        case "m_vecOrigin":
          if (origin < 0) origin = i;
          break;
        case "m_cellbits":
          if (cellBits < 0) cellBits = i;
          break;
        case "m_cellX":
          if (cellX < 0) cellX = i;
          break;
        case "m_cellY":
          if (cellY < 0) cellY = i;
          break;
        case "m_cellZ":
          if (cellZ < 0) cellZ = i;
          break;
      }
    }
    layout = { origin, cellBits, cellX, cellY, cellZ };
    layoutCache.set(serverClass, layout);
  }
  return layout;
}

/** Convert one axis from (cell index, cell width, in-cell offset) to world space. */
export function coordFromCell(cell: number, cellWidth: number, offset: number): number {
  return cell * cellWidth - MAX_COORD_INTEGER + offset;
}

/**
 * Read an entity's world-space origin. Returns `undefined` when the origin
 * (or, for cell-encoded classes, any of the cell props) has not been written
 * yet. ServerClasses without the cell props return `m_vecOrigin` unchanged.
 */
export function readEntityOrigin(entity: Entity): Vector3 | undefined {
  const layout = layoutFor(entity.serverClass);
  if (layout.origin < 0) return undefined;
  const { store, storageSlot } = entity;
  const offset = store.read(storageSlot, layout.origin);
  if (offset === undefined || typeof offset !== "object" || !("x" in offset)) return undefined;
  const v = offset as { x: number; y: number; z?: number };
  const oz = v.z ?? 0;
  if (layout.cellBits < 0 || layout.cellX < 0 || layout.cellY < 0 || layout.cellZ < 0) {
    return { x: v.x, y: v.y, z: oz };
  }
  const bits = store.read(storageSlot, layout.cellBits);
  const cx = store.read(storageSlot, layout.cellX);
  const cy = store.read(storageSlot, layout.cellY);
  const cz = store.read(storageSlot, layout.cellZ);
  if (
    typeof bits !== "number" ||
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    typeof cz !== "number"
  ) {
    return undefined;
  }
  const width = 1 << bits;
  return {
    x: coordFromCell(cx, width, v.x),
    y: coordFromCell(cy, width, v.y),
    z: coordFromCell(cz, width, oz),
  };
}
