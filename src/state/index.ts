/**
 * Public barrel for `src/state/` — typed overlays on top of the M2 entity
 * store and parser-level metadata.
 *
 * Each member of this module is a *read-side typed projection* of state the
 * core parser already maintains. No member of this directory parses bytes,
 * decodes wire data, or owns mutable parser state — they translate between
 * raw decoded structures (the protobuf `CSVCMsg_*` shapes, the entity
 * `propByName` map, demo-header fields) and the consumer-facing typed shape.
 */
export {
  ENTITY_INDEX_BITS,
  ENTITY_INDEX_MASK,
  ENTITY_SERIAL_BITS_21,
  ENTITY_SERIAL_BITS_32,
  INVALID_HANDLE,
  handleToIndex,
  handleToSerial,
  isValidHandle,
  resolveHandle,
} from "./EntityHandle.js";

export type { TypedServerInfo } from "./ServerInfo.js";
export { buildServerInfo } from "./ServerInfo.js";

export { Player } from "./Player.js";
export type { Vector3, ViewAngle, PlayerSnapshot } from "./Player.js";
export { Weapon } from "./Weapon.js";
export type { WeaponSnapshot } from "./Weapon.js";
export { PlayerResource, MAX_PLAYER_SLOTS } from "./PlayerResource.js";
export type { PlayerResourceSnapshot } from "./PlayerResource.js";
