import { describe, expect, it } from "vitest";
import { enrichBombAbortPlant } from "../../../../src/events/enrichers/bombAbortPlant.js";
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
    name: "bomb_abortplant",
    eventId: 107,
    data: Object.freeze(data),
  };
}

describe("enrichBombAbortPlant", () => {
  it("happy path: resolves player, surfaces site, freezes payload", () => {
    const planter = { slot: 3 } as Player;
    const ctx = makeCtx(new Map([[67, planter]]));

    const result = enrichBombAbortPlant(
      makeRaw({ userid: 67, site: 174 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("bomb_abortplant");
    expect(result!.eventId).toBe(107);
    expect(result!.player).toBe(planter);
    expect(result!.site).toBe(174);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichBombAbortPlant(
      makeRaw({ userid: 999, site: 174 }),
      ctx,
    );
    expect(result).toBeNull();
  });
});
