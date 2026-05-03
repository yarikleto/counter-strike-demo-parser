/**
 * Barrel export for the events module.
 *
 * Re-exports the TypedEventEmitter class plus the `EventMap` and `Listener`
 * helper types that consumers (and future parser modules) will use to declare
 * their event maps.
 */
export { TypedEventEmitter } from "./TypedEventEmitter.js";
export type { EventMap, Listener } from "./TypedEventEmitter.js";
export {
  EventDescriptorTable,
  buildDescriptorTable,
} from "./EventDescriptorTable.js";
export type {
  EventDescriptor,
  EventKeyDescriptor,
  EventKeyType,
} from "./EventDescriptor.js";
export { eventKeyTypeFromWire } from "./EventDescriptor.js";
export { decodeGameEvent } from "./GameEventDecoder.js";
export type { DecodedGameEvent } from "./GameEventDecoder.js";
export { buildEnricherContext } from "./EnricherContext.js";
export type { EnricherContext } from "./EnricherContext.js";
export { freezeEvent, enricherTable } from "./enrichers/index.js";
export type { Enricher, EnrichedEvent } from "./enrichers/Enricher.js";
