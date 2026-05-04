import { describe, expect, it } from "vitest";
import { enrichGrenadeThrown } from "../../../../src/events/enrichers/grenadeThrown.js";
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
    name: "grenade_thrown",
    eventId: 132,
    data: Object.freeze(data),
  };
}

describe("enrichGrenadeThrown", () => {
  it("happy path: resolves thrower, surfaces weapon", () => {
    const thrower = { slot: 1 } as Player;
    const ctx = makeCtx(new Map([[42, thrower]]));

    const result = enrichGrenadeThrown(
      makeRaw({ userid: 42, weapon: "weapon_hegrenade" }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("grenade_thrown");
    expect(result!.eventId).toBe(132);
    expect(result!.thrower).toBe(thrower);
    expect(result!.weapon).toBe("weapon_hegrenade");
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("returns null when thrower doesn't resolve", () => {
    const ctx = makeCtx(new Map());

    const result = enrichGrenadeThrown(
      makeRaw({ userid: 999, weapon: "weapon_flashbang" }),
      ctx,
    );

    expect(result).toBeNull();
  });

  it("returns null when userid is 0 (engine-emitted)", () => {
    const ctx = makeCtx(new Map());

    const result = enrichGrenadeThrown(
      makeRaw({ userid: 0, weapon: "weapon_smokegrenade" }),
      ctx,
    );

    expect(result).toBeNull();
  });

  it("missing weapon key surfaces empty string", () => {
    const thrower = { slot: 3 } as Player;
    const ctx = makeCtx(new Map([[7, thrower]]));

    const result = enrichGrenadeThrown(makeRaw({ userid: 7 }), ctx);

    expect(result).not.toBeNull();
    expect(result!.weapon).toBe("");
  });
});
