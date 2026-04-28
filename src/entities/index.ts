/**
 * Public barrel for the entity layer.
 *
 * Exposes the consumer-facing types (`Entity`, `EntityList`, the typed error
 * classes) plus the `decodePacketEntities` entry point used by the parser.
 * Internal helpers (`EntityStore`, `PropColumns`, baseline decoder) stay
 * unexposed at this level so M3 can refactor them freely.
 */
export { Entity } from "./Entity.js";
export { EntityList, MAX_EDICTS } from "./EntityList.js";
export { decodePacketEntities } from "./PacketEntitiesDecoder.js";
export type { PacketEntitiesEmit } from "./PacketEntitiesDecoder.js";
export {
  EntityClassMismatchError,
  StaleEntityError,
  BitStreamMisalignmentError,
} from "./errors.js";
