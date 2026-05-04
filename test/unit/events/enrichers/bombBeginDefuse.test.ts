import { describe, expect, it } from "vitest";
import { enrichBombBeginDefuse } from "../../../../src/events/enrichers/bombBeginDefuse.js";
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
    name: "bomb_begindefuse",
    eventId: 117,
    data: Object.freeze(data),
  };
}

describe("enrichBombBeginDefuse", () => {
  it("happy path: resolves player and surfaces hasKit (with-kit case)", () => {
    const defuser = { slot: 9 } as Player;
    const ctx = makeCtx(new Map([[127, defuser]]));

    const result = enrichBombBeginDefuse(
      makeRaw({ userid: 127, haskit: true }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("bomb_begindefuse");
    expect(result!.eventId).toBe(117);
    expect(result!.player).toBe(defuser);
    expect(result!.hasKit).toBe(true);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("hasKit false when wire haskit is false", () => {
    const defuser = { slot: 9 } as Player;
    const ctx = makeCtx(new Map([[127, defuser]]));

    const result = enrichBombBeginDefuse(
      makeRaw({ userid: 127, haskit: false }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.hasKit).toBe(false);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichBombBeginDefuse(
      makeRaw({ userid: 999, haskit: true }),
      ctx,
    );
    expect(result).toBeNull();
  });
});
