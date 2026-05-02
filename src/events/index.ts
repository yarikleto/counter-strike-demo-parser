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
