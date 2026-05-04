import { describe, expect, it } from "vitest";
import { enrichBombPickedUp } from "../../../../src/events/enrichers/bombPickedUp.js";
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
    name: "bomb_pickup",
    eventId: 112,
    data: Object.freeze(data),
  };
}

describe("enrichBombPickedUp", () => {
  it("happy path: resolves the picker-upper, freezes payload", () => {
    const player = { slot: 7 } as Player;
    const ctx = makeCtx(new Map([[34, player]]));

    const result = enrichBombPickedUp(makeRaw({ userid: 34 }), ctx);

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("bomb_pickup");
    expect(result!.eventId).toBe(112);
    expect(result!.player).toBe(player);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichBombPickedUp(makeRaw({ userid: 999 }), ctx);
    expect(result).toBeNull();
  });
});
