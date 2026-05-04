import { describe, expect, it } from "vitest";
import { enrichDecoyDetonate } from "../../../../src/events/enrichers/decoyDetonate.js";
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
    name: "decoy_detonate",
    eventId: 165,
    data: Object.freeze(data),
  };
}

describe("enrichDecoyDetonate", () => {
  it("happy path: resolves thrower and frozen position", () => {
    const thrower = { slot: 7 } as Player;
    const ctx = makeCtx(new Map([[67, thrower]]));

    const result = enrichDecoyDetonate(
      makeRaw({
        userid: 67,
        entityid: 640,
        x: -188.69,
        y: -1862.3,
        z: -414.0,
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("decoy_detonate");
    expect(result!.thrower).toBe(thrower);
    expect(result!.position).toEqual({ x: -188.69, y: -1862.3, z: -414.0 });
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("thrower unresolved: still emits with thrower undefined", () => {
    const ctx = makeCtx(new Map());

    const result = enrichDecoyDetonate(
      makeRaw({ userid: 999, entityid: 1, x: 1, y: 2, z: 3 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.thrower).toBeUndefined();
  });
});
