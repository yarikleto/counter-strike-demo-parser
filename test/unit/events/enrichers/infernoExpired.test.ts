import { describe, expect, it } from "vitest";
import { enrichInfernoExpired } from "../../../../src/events/enrichers/infernoExpired.js";
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
    name: "inferno_expire",
    eventId: 169,
    data: Object.freeze(data),
  };
}

describe("enrichInfernoExpired", () => {
  it("happy path: surfaces position; thrower undefined (descriptor lacks userid)", () => {
    // CS:GO's `inferno_expire` schema is { entityid, x, y, z } — there is no
    // userid on the wire. `thrower` always surfaces as undefined; the entricher
    // is consistent with the rest of the family for ergonomics.
    const ctx = makeCtx(new Map());

    const result = enrichInfernoExpired(
      makeRaw({ entityid: 413, x: 394.07, y: -2173.1, z: -416.0 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("inferno_expire");
    expect(result!.thrower).toBeUndefined();
    expect(result!.position).toEqual({ x: 394.07, y: -2173.1, z: -416.0 });
    expect(Object.isFrozen(result!)).toBe(true);
    expect(Object.isFrozen(result!.position)).toBe(true);
  });

  it("missing position fields default to 0", () => {
    const ctx = makeCtx(new Map());

    const result = enrichInfernoExpired(makeRaw({ entityid: 0 }), ctx);

    expect(result).not.toBeNull();
    expect(result!.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});
