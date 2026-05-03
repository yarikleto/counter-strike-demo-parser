/**
 * Enricher — the function shape every Tier-1 game-event enricher implements
 * (ADR-006). Pure: `(rawDecodedEvent, context) -> typedEvent | null`. No
 * per-event class state, no lifecycle, trivially testable from a hand-built
 * `DecodedGameEvent` literal plus a stub `EnricherContext`.
 *
 * The enricher returns `null` ONLY when the raw event is structurally
 * unrepresentable as Tier-1 — e.g. the descriptor schema shifted under us
 * (defensive, should not happen on a well-formed CS:GO demo). Missing-userid
 * does NOT return null per ADR-006 decision 5: the resolved `Player` field
 * is set to `undefined` and the event still emits. A listener subscribed
 * only to Tier-1 should still observe a frag where the attacker disconnected
 * one tick before — silently dropping it would be worse than the missing
 * Player reference.
 */
import type { DecodedGameEvent } from "../GameEventDecoder.js";
import type { EnricherContext } from "../EnricherContext.js";

/**
 * Marker base for every Tier-1 enriched event payload. Concrete payloads
 * (`PlayerDeathEvent`, `BombPlantedEvent`, etc.) extend this and add their
 * typed fields. `eventName` and `eventId` carry over from the raw decoded
 * event so a listener subscribed to the named Tier-1 event can still
 * recover the wire-level identifiers without re-routing through the Tier-2
 * `gameEvent` catch-all.
 */
export interface EnrichedEvent {
  readonly eventName: string;
  readonly eventId: number;
}

/**
 * Pure transform: raw decoded event + read-only parser context to the typed
 * Tier-1 event payload. Concrete enrichers should `Object.freeze` their
 * result before returning (or call {@link freezeEvent}).
 */
export type Enricher<T extends EnrichedEvent = EnrichedEvent> = (
  raw: DecodedGameEvent,
  ctx: EnricherContext,
) => T | null;

/**
 * Convenience wrapper for enrichers — `Object.freeze` the constructed
 * payload and return it with its inferred concrete type intact. Consistent
 * with TASK-037's `Object.freeze(data)` on the Tier-2 payload.
 */
export function freezeEvent<T extends EnrichedEvent>(event: T): Readonly<T> {
  return Object.freeze(event);
}
