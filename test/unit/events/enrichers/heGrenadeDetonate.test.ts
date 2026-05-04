import { describe, expect, it } from "vitest";
import { enrichHeGrenadeDetonate } from "../../../../src/events/enrichers/heGrenadeDetonate.js";
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
    name: "hegrenade_detonate",
    eventId: 160,
    data: Object.freeze(data),
  };
}

describe("enrichHeGrenadeDetonate", () => {
  it("happy path: resolves thrower and frozen position", () => {
    const thrower = { slot: 2 } as Player;
    const ctx = makeCtx(new Map([[127, thrower]]));

    const result = enrichHeGrenadeDetonate(
      makeRaw({
        userid: 127,
        entityid: 413,
        x: 220.5,
        y: -2039.9,
        z: -301.0,
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("hegrenade_detonate");
    expect(result!.thrower).toBe(thrower);
    expect(result!.position).toEqual({ x: 220.5, y: -2039.9, z: -301.0 });
    expect(Object.isFrozen(result!)).toBe(true);
    expect(Object.isFrozen(result!.position)).toBe(true);
  });

  it("thrower unresolved: still emits with thrower undefined", () => {
    const ctx = makeCtx(new Map());

    const result = enrichHeGrenadeDetonate(
      makeRaw({ userid: 999, entityid: 1, x: 1, y: 2, z: 3 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.thrower).toBeUndefined();
    expect(result!.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("missing position fields default to 0", () => {
    const ctx = makeCtx(new Map());

    const result = enrichHeGrenadeDetonate(makeRaw({ userid: 0 }), ctx);

    expect(result).not.toBeNull();
    expect(result!.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});
