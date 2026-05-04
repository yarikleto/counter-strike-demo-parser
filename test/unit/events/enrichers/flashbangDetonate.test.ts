import { describe, expect, it } from "vitest";
import { enrichFlashbangDetonate } from "../../../../src/events/enrichers/flashbangDetonate.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";
import type { Player } from "../../../../src/state/Player.js";

function makeCtx(players: Map<number, Player>): EnricherContext {
  return {
    players: [...players.values()],
    entities: undefined,
    gameRules: undefined,
    teams: [],
    userInfoIndex: undefined,
    resolvePlayer: (uid: number) => players.get(uid),
  } as unknown as EnricherContext;
}

function makeRaw(
  data: Record<string, string | number | boolean>,
): DecodedGameEvent {
  return {
    name: "flashbang_detonate",
    eventId: 161,
    data: Object.freeze(data),
  };
}

describe("enrichFlashbangDetonate", () => {
  it("happy path: resolves thrower, frozen position, empty playersFlashed", () => {
    const thrower = { slot: 2 } as Player;
    const ctx = makeCtx(new Map([[127, thrower]]));

    const result = enrichFlashbangDetonate(
      makeRaw({
        userid: 127,
        entityid: 589,
        x: 329.6,
        y: -1879.5,
        z: -294.7,
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("flashbang_detonate");
    expect(result!.thrower).toBe(thrower);
    expect(result!.position).toEqual({ x: 329.6, y: -1879.5, z: -294.7 });
    // CS:GO's flashbang_detonate descriptor on production demos doesn't carry
    // a per-flashed-victim array — see enricher JSDoc. Always [].
    expect(result!.playersFlashed).toEqual([]);
    expect(Object.isFrozen(result!)).toBe(true);
    expect(Object.isFrozen(result!.position)).toBe(true);
    expect(Object.isFrozen(result!.playersFlashed)).toBe(true);
  });

  it("thrower unresolved: still emits with thrower undefined", () => {
    const ctx = makeCtx(new Map());

    const result = enrichFlashbangDetonate(
      makeRaw({ userid: 999, entityid: 1, x: 1, y: 2, z: 3 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.thrower).toBeUndefined();
    expect(result!.playersFlashed).toEqual([]);
  });

  it("missing position fields default to 0", () => {
    const ctx = makeCtx(new Map());

    const result = enrichFlashbangDetonate(makeRaw({ userid: 0 }), ctx);

    expect(result).not.toBeNull();
    expect(result!.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});
