import { describe, expect, it } from "vitest";
import { enrichMolotovDetonate } from "../../../../src/events/enrichers/molotovDetonate.js";
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
    name: "molotov_detonate",
    eventId: 164,
    data: Object.freeze(data),
  };
}

describe("enrichMolotovDetonate", () => {
  it("happy path: resolves thrower and frozen position", () => {
    const thrower = { slot: 5 } as Player;
    const ctx = makeCtx(new Map([[55, thrower]]));

    const result = enrichMolotovDetonate(
      makeRaw({ userid: 55, x: 100, y: 200, z: 300 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("molotov_detonate");
    expect(result!.thrower).toBe(thrower);
    expect(result!.position).toEqual({ x: 100, y: 200, z: 300 });
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("thrower unresolved: still emits with thrower undefined", () => {
    const ctx = makeCtx(new Map());

    const result = enrichMolotovDetonate(
      makeRaw({ userid: 999, x: 1, y: 2, z: 3 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.thrower).toBeUndefined();
    expect(result!.position).toEqual({ x: 1, y: 2, z: 3 });
  });
});
