/**
 * TypedEventEmitter — a tiny, fully-typed event emitter with no Node
 * dependency, so the parser runs unchanged in browsers and Web Workers.
 *
 * The method surface mirrors the subset of Node's EventEmitter the parser
 * uses (`on`, `off`, `once`, `addListener`, `removeListener`,
 * `removeAllListeners`, `emit`, `listenerCount`) and is typed so that:
 *   - Event names must be keys of the supplied `EventMap`.
 *   - Listener parameters are inferred from the corresponding payload type.
 *   - `emit` payloads must match the declared payload shape.
 *
 * Misuse (typo'd event name, wrong payload, wrong listener signature) becomes
 * a compile-time error rather than a runtime surprise.
 *
 * Hot path: listener lists are copy-on-write arrays. `emit()` iterates the
 * current array without allocating, and adding/removing a listener (rare)
 * swaps in a new array — so a listener that removes itself or others
 * mid-emit does not disturb the in-flight iteration, matching Node.
 * Important for parsers that emit hundreds of thousands of events per demo.
 *
 * Error semantics match Node's default: a listener that throws propagates
 * out of `emit()` and remaining listeners for that event are NOT invoked.
 * Unlike Node, an unhandled `"error"` event is not special-cased.
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

/**
 * Base constraint for event maps: a record of event-name -> payload type.
 *
 * Declared as an open `object` type so that both plain object type aliases
 * and TypeScript interfaces (which do not implicitly satisfy index-signature
 * types like `Record<string, unknown>`) can be used as `TEvents`. The
 * per-method generics (`K extends keyof TEvents & string`) still constrain
 * event names to actual declared keys, so type safety is fully preserved.
 */
export type EventMap = object;

/** Listener signature for a given event. */
export type Listener<T> = (payload: T) => void;

type AnyListener = (payload: never) => void;

/** `once` wrapper; remembers the original so `off(original)` removes it. */
interface OnceWrapper {
  (payload: never): void;
  readonly listener: AnyListener;
}

export class TypedEventEmitter<TEvents extends EventMap> {
  private readonly listenerMap = new Map<string, readonly AnyListener[]>();

  on<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>): this {
    const current = this.listenerMap.get(event);
    this.listenerMap.set(
      event,
      current === undefined ? [listener as AnyListener] : [...current, listener as AnyListener],
    );
    return this;
  }

  addListener<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>): this {
    return this.on(event, listener);
  }

  once<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>): this {
    const wrapper = ((payload: TEvents[K]) => {
      this.off(event, listener);
      listener(payload);
    }) as unknown as OnceWrapper;
    (wrapper as { listener: AnyListener }).listener = listener as AnyListener;
    return this.on(event, wrapper as unknown as Listener<TEvents[K]>);
  }

  off<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>): this {
    const current = this.listenerMap.get(event);
    if (current === undefined) return this;
    // Remove the most recently added match, like Node.
    for (let i = current.length - 1; i >= 0; i--) {
      const l = current[i]!;
      if (l === listener || (l as Partial<OnceWrapper>).listener === listener) {
        if (current.length === 1) {
          this.listenerMap.delete(event);
        } else {
          this.listenerMap.set(event, [...current.slice(0, i), ...current.slice(i + 1)]);
        }
        break;
      }
    }
    return this;
  }

  removeListener<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>): this {
    return this.off(event, listener);
  }

  removeAllListeners<K extends keyof TEvents & string>(event?: K): this {
    if (event === undefined) this.listenerMap.clear();
    else this.listenerMap.delete(event);
    return this;
  }

  emit<K extends keyof TEvents & string>(event: K, payload: TEvents[K]): boolean {
    const listeners = this.listenerMap.get(event) as readonly Listener<TEvents[K]>[] | undefined;
    if (listeners === undefined) return false;
    for (const listener of listeners) listener(payload);
    return true;
  }

  listenerCount<K extends keyof TEvents & string>(event: K): number {
    return this.listenerMap.get(event)?.length ?? 0;
  }
}
