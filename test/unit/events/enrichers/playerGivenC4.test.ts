import { describe, expect, it } from "vitest";
import { enrichPlayerGivenC4 } from "../../../../src/events/enrichers/playerGivenC4.js";
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
    name: "player_given_c4",
    eventId: 60,
    data: Object.freeze(data),
  };
}

describe("enrichPlayerGivenC4", () => {
  it("happy path: resolves the player carrying C4", () => {
    const player = { slot: 2 } as Player;
    const ctx = makeCtx(new Map([[22, player]]));

    const result = enrichPlayerGivenC4(makeRaw({ userid: 22 }), ctx);

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("player_given_c4");
    expect(result!.player).toBe(player);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichPlayerGivenC4(makeRaw({ userid: 999 }), ctx);
    expect(result).toBeNull();
  });
});
