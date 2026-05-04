import { describe, expect, it } from "vitest";
import { enrichSmokeGrenadeExpired } from "../../../../src/events/enrichers/smokeGrenadeExpired.js";
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
    name: "smokegrenade_expired",
    eventId: 163,
    data: Object.freeze(data),
  };
}

describe("enrichSmokeGrenadeExpired", () => {
  it("happy path: resolves thrower and frozen position", () => {
    const thrower = { slot: 7 } as Player;
    const ctx = makeCtx(new Map([[67, thrower]]));

    const result = enrichSmokeGrenadeExpired(
      makeRaw({
        userid: 67,
        entityid: 586,
        x: 687.69,
        y: -1746.1,
        z: -413.96,
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("smokegrenade_expired");
    expect(result!.thrower).toBe(thrower);
    expect(result!.position).toEqual({ x: 687.69, y: -1746.1, z: -413.96 });
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("thrower unresolved: still emits with thrower undefined", () => {
    const ctx = makeCtx(new Map());

    const result = enrichSmokeGrenadeExpired(
      makeRaw({ userid: 999, entityid: 1, x: 1, y: 2, z: 3 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.thrower).toBeUndefined();
    expect(result!.position).toEqual({ x: 1, y: 2, z: 3 });
  });
});
