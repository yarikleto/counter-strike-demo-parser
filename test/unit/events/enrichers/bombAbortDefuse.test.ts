import { describe, expect, it } from "vitest";
import { enrichBombAbortDefuse } from "../../../../src/events/enrichers/bombAbortDefuse.js";
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
    name: "bomb_abortdefuse",
    eventId: 118,
    data: Object.freeze(data),
  };
}

describe("enrichBombAbortDefuse", () => {
  it("happy path: resolves the aborting defuser, freezes payload", () => {
    const defuser = { slot: 9 } as Player;
    const ctx = makeCtx(new Map([[127, defuser]]));

    const result = enrichBombAbortDefuse(makeRaw({ userid: 127 }), ctx);

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("bomb_abortdefuse");
    expect(result!.eventId).toBe(118);
    expect(result!.player).toBe(defuser);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichBombAbortDefuse(makeRaw({ userid: 999 }), ctx);
    expect(result).toBeNull();
  });
});
