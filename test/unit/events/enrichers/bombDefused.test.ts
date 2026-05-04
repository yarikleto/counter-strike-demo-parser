import { describe, expect, it } from "vitest";
import { enrichBombDefused } from "../../../../src/events/enrichers/bombDefused.js";
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
    name: "bomb_defused",
    eventId: 109,
    data: Object.freeze(data),
  };
}

describe("enrichBombDefused", () => {
  it("happy path: resolves player, surfaces site, freezes payload", () => {
    const defuser = { slot: 5 } as Player;
    const ctx = makeCtx(new Map([[3, defuser]]));

    const result = enrichBombDefused(
      makeRaw({ userid: 3, site: 174 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("bomb_defused");
    expect(result!.eventId).toBe(109);
    expect(result!.player).toBe(defuser);
    expect(result!.site).toBe(174);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichBombDefused(
      makeRaw({ userid: 999, site: 174 }),
      ctx,
    );
    expect(result).toBeNull();
  });
});
