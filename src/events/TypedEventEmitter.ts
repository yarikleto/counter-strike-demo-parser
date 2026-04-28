/**
 * TypedEventEmitter — a thin, fully-typed wrapper over Node's EventEmitter.
 *
 * The class exists purely to attach a TypeScript `EventMap` to Node's runtime
 * event machinery. Each method (`on`, `off`, `once`, `emit`, etc.) is retyped
 * so that:
 *   - Event names must be keys of the supplied `EventMap`.
 *   - Listener parameters are inferred from the corresponding payload type.
 *   - `emit` payloads must match the declared payload shape.
 *
 * Misuse (typo'd event name, wrong payload, wrong listener signature) becomes
 * a compile-time error rather than a runtime surprise.
 *
 * Why extend Node's EventEmitter rather than build from scratch:
 *   - Battle-tested listener bookkeeping, `once`, removal, and error semantics.
 *   - No per-`emit()` allocations on the hot path — Node iterates its internal
 *     handler list directly. Important for parsers that may emit hundreds of
 *     thousands of events per demo.
 *   - Fewer lines of code, fewer bugs, smaller surface to maintain.
 *
 * Error semantics: a listener that throws follows Node's default behavior —
 * the exception propagates out of `emit()` and remaining listeners for that
 * event are NOT invoked. If callers need different behavior they can wrap
 * their listeners in try/catch.
 *
 * @example
 * ```ts
 * type Events = {
 *   serverInfo: { mapName: string; tickInterval: number };
 *   playerDeath: { victim: number; attacker: number };
 * };
 *
 * const emitter = new TypedEventEmitter<Events>();
 * emitter.on("serverInfo", (info) => {
 *   // info is typed as { mapName: string; tickInterval: number }
 * });
 * emitter.emit("serverInfo", { mapName: "de_nuke", tickInterval: 1 / 64 });
 * ```
 */
import { EventEmitter } from "node:events";

/**
 * Base constraint for event maps: a record of event-name -> payload type.
 *
 * Symbol keys are excluded because Node's EventEmitter accepts them but they
 * make the type-level event-name machinery harder to reason about and they
 * don't appear in any of our use cases.
 */
export type EventMap = Record<string, unknown>;

/** Listener signature for a given event. */
export type Listener<T> = (payload: T) => void;

export class TypedEventEmitter<TEvents extends EventMap> extends EventEmitter {
  override on<K extends keyof TEvents & string>(
    event: K,
    listener: Listener<TEvents[K]>,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof TEvents & string>(
    event: K,
    listener: Listener<TEvents[K]>,
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends keyof TEvents & string>(
    event: K,
    listener: Listener<TEvents[K]>,
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  override addListener<K extends keyof TEvents & string>(
    event: K,
    listener: Listener<TEvents[K]>,
  ): this {
    return super.addListener(event, listener as (...args: unknown[]) => void);
  }

  override removeListener<K extends keyof TEvents & string>(
    event: K,
    listener: Listener<TEvents[K]>,
  ): this {
    return super.removeListener(
      event,
      listener as (...args: unknown[]) => void,
    );
  }

  override removeAllListeners<K extends keyof TEvents & string>(
    event?: K,
  ): this {
    return super.removeAllListeners(event);
  }

  override emit<K extends keyof TEvents & string>(
    event: K,
    payload: TEvents[K],
  ): boolean {
    return super.emit(event, payload);
  }

  override listenerCount<K extends keyof TEvents & string>(event: K): number {
    return super.listenerCount(event);
  }
}
