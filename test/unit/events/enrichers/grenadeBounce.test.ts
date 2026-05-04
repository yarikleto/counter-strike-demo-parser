import { describe, expect, it } from "vitest";
import { enrichGrenadeBounce } from "../../../../src/events/enrichers/grenadeBounce.js";
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
    name: "grenade_bounce",
    eventId: 159,
    data: Object.freeze(data),
  };
}

describe("enrichGrenadeBounce", () => {
  it("happy path: resolves thrower", () => {
    const thrower = { slot: 4 } as Player;
    const ctx = makeCtx(new Map([[88, thrower]]));

    const result = enrichGrenadeBounce(makeRaw({ userid: 88 }), ctx);

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("grenade_bounce");
    expect(result!.eventId).toBe(159);
    expect(result!.thrower).toBe(thrower);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("returns null when thrower doesn't resolve", () => {
    const ctx = makeCtx(new Map());

    const result = enrichGrenadeBounce(makeRaw({ userid: 999 }), ctx);

    expect(result).toBeNull();
  });

  it("returns null when userid is 0", () => {
    const ctx = makeCtx(new Map());

    const result = enrichGrenadeBounce(makeRaw({ userid: 0 }), ctx);

    expect(result).toBeNull();
  });
});
