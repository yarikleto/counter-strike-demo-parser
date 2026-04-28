import { describe, it, expect, vi } from "vitest";
import { TypedEventEmitter } from "../../../src/events/TypedEventEmitter.js";
import type { Listener } from "../../../src/events/TypedEventEmitter.js";

interface PlayerDeathEvent {
  victim: number;
  attacker: number;
  weapon: string;
}

interface ServerInfoEvent {
  mapName: string;
  tickInterval: number;
}

interface RoundEndEvent {
  winningTeam: "T" | "CT";
}

type TestEvents = {
  playerDeath: PlayerDeathEvent;
  serverInfo: ServerInfoEvent;
  roundEnd: RoundEndEvent;
};

describe("TypedEventEmitter", () => {
  describe("runtime behavior", () => {
    it("emit invokes registered listeners with the payload", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      const listener = vi.fn();
      emitter.on("serverInfo", listener);

      emitter.emit("serverInfo", { mapName: "de_nuke", tickInterval: 1 / 64 });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        mapName: "de_nuke",
        tickInterval: 1 / 64,
      });
    });

    it("invokes listeners in registration order", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      const calls: string[] = [];
      emitter.on("roundEnd", () => calls.push("first"));
      emitter.on("roundEnd", () => calls.push("second"));
      emitter.on("roundEnd", () => calls.push("third"));

      emitter.emit("roundEnd", { winningTeam: "CT" });

      expect(calls).toEqual(["first", "second", "third"]);
    });

    it("multiple listeners for the same event all fire", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      const a = vi.fn();
      const b = vi.fn();
      emitter.on("playerDeath", a);
      emitter.on("playerDeath", b);

      emitter.emit("playerDeath", {
        victim: 1,
        attacker: 2,
        weapon: "ak47",
      });

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });

    it("off() removes a previously registered listener", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      const listener = vi.fn();
      emitter.on("roundEnd", listener);
      emitter.off("roundEnd", listener);

      emitter.emit("roundEnd", { winningTeam: "T" });

      expect(listener).not.toHaveBeenCalled();
    });

    it("off() only removes the specified listener, not others", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      const keep = vi.fn();
      const drop = vi.fn();
      emitter.on("roundEnd", keep);
      emitter.on("roundEnd", drop);
      emitter.off("roundEnd", drop);

      emitter.emit("roundEnd", { winningTeam: "T" });

      expect(keep).toHaveBeenCalledTimes(1);
      expect(drop).not.toHaveBeenCalled();
    });

    it("once() fires exactly once across multiple emits", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      const listener = vi.fn();
      emitter.once("serverInfo", listener);

      emitter.emit("serverInfo", { mapName: "de_nuke", tickInterval: 1 / 64 });
      emitter.emit("serverInfo", { mapName: "de_dust2", tickInterval: 1 / 64 });
      emitter.emit("serverInfo", { mapName: "de_mirage", tickInterval: 1 / 64 });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        mapName: "de_nuke",
        tickInterval: 1 / 64,
      });
    });

    it("listeners registered for one event do not fire for another", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      const deathListener = vi.fn();
      const serverInfoListener = vi.fn();
      emitter.on("playerDeath", deathListener);
      emitter.on("serverInfo", serverInfoListener);

      emitter.emit("serverInfo", { mapName: "de_nuke", tickInterval: 1 / 64 });

      expect(deathListener).not.toHaveBeenCalled();
      expect(serverInfoListener).toHaveBeenCalledTimes(1);
    });

    it("emit returns true when listeners are present, false otherwise", () => {
      const emitter = new TypedEventEmitter<TestEvents>();

      expect(
        emitter.emit("roundEnd", { winningTeam: "T" }),
      ).toBe(false);

      emitter.on("roundEnd", () => {});

      expect(
        emitter.emit("roundEnd", { winningTeam: "T" }),
      ).toBe(true);
    });

    it("listenerCount reflects the number of registered listeners", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      expect(emitter.listenerCount("playerDeath")).toBe(0);

      const a: Listener<PlayerDeathEvent> = () => {};
      const b: Listener<PlayerDeathEvent> = () => {};
      emitter.on("playerDeath", a);
      emitter.on("playerDeath", b);
      expect(emitter.listenerCount("playerDeath")).toBe(2);

      emitter.off("playerDeath", a);
      expect(emitter.listenerCount("playerDeath")).toBe(1);
    });

    it("removeAllListeners clears every listener for the event", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      emitter.on("roundEnd", () => {});
      emitter.on("roundEnd", () => {});
      emitter.removeAllListeners("roundEnd");

      expect(emitter.listenerCount("roundEnd")).toBe(0);
    });

    it("a listener that throws halts subsequent listeners (Node's default)", () => {
      // Documents Node EventEmitter's default behavior: emit() rethrows
      // synchronously and subsequent listeners are skipped. Callers that need
      // isolation should wrap their own listeners in try/catch.
      const emitter = new TypedEventEmitter<TestEvents>();
      const after = vi.fn();
      emitter.on("roundEnd", () => {
        throw new Error("boom");
      });
      emitter.on("roundEnd", after);

      expect(() =>
        emitter.emit("roundEnd", { winningTeam: "CT" }),
      ).toThrow("boom");
      expect(after).not.toHaveBeenCalled();
    });
  });

  describe("type-level checks (compile-time)", () => {
    // These tests pass purely by virtue of typecheck succeeding. The
    // `@ts-expect-error` directives assert the next line MUST fail to compile;
    // if any of them ever starts compiling, `tsc --noEmit` will fail.

    it("infers the listener payload type from the event name", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      let captured: PlayerDeathEvent | undefined;
      emitter.on("playerDeath", (e) => {
        // e is inferred as PlayerDeathEvent — assigning to a typed const proves it.
        const typed: PlayerDeathEvent = e;
        captured = typed;
      });
      emitter.emit("playerDeath", {
        victim: 1,
        attacker: 2,
        weapon: "ak47",
      });
      expect(captured).toEqual({ victim: 1, attacker: 2, weapon: "ak47" });
    });

    it("rejects unknown event names on on()", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      // @ts-expect-error — "typo" is not a key of TestEvents
      emitter.on("typo", () => {});
      expect(emitter.listenerCount("playerDeath")).toBe(0);
    });

    it("rejects unknown event names on emit()", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      // @ts-expect-error — "typo" is not a key of TestEvents
      emitter.emit("typo", { whatever: true });
      expect(true).toBe(true);
    });

    it("rejects wrong payload shape on emit()", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      // @ts-expect-error — playerDeath payload requires victim/attacker/weapon
      emitter.emit("playerDeath", { mapName: "de_nuke" });
      expect(true).toBe(true);
    });

    it("rejects missing payload on emit()", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      // @ts-expect-error — emit requires the payload argument
      emitter.emit("roundEnd");
      expect(true).toBe(true);
    });

    it("rejects listener with the wrong payload signature on on()", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      // @ts-expect-error — listener parameter typed as ServerInfoEvent, not PlayerDeathEvent
      emitter.on("playerDeath", (e: ServerInfoEvent) => {
        void e;
      });
      expect(true).toBe(true);
    });

    it("rejects unknown event name on off() and once()", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      // @ts-expect-error — "typo" is not a key of TestEvents
      emitter.off("typo", () => {});
      // @ts-expect-error — "typo" is not a key of TestEvents
      emitter.once("typo", () => {});
      expect(true).toBe(true);
    });

    it("supports method chaining with preserved typing", () => {
      const emitter = new TypedEventEmitter<TestEvents>();
      const result = emitter
        .on("roundEnd", (e) => {
          const typed: RoundEndEvent = e;
          void typed;
        })
        .on("playerDeath", (e) => {
          const typed: PlayerDeathEvent = e;
          void typed;
        });
      expect(result).toBe(emitter);
    });
  });
});
