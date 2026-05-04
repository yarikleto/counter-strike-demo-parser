import { describe, expect, it } from "vitest";
import { enrichBombDropped } from "../../../../src/events/enrichers/bombDropped.js";
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
    name: "bomb_dropped",
    eventId: 111,
    data: Object.freeze(data),
  };
}

describe("enrichBombDropped", () => {
  it("happy path: resolves player and surfaces entityIndex from `entindex` wire field", () => {
    const dropper = { slot: 4 } as Player;
    const ctx = makeCtx(new Map([[34, dropper]]));

    const result = enrichBombDropped(
      makeRaw({ userid: 34, entindex: 927 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("bomb_dropped");
    expect(result!.eventId).toBe(111);
    expect(result!.player).toBe(dropper);
    expect(result!.entityIndex).toBe(927);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichBombDropped(
      makeRaw({ userid: 999, entindex: 927 }),
      ctx,
    );
    expect(result).toBeNull();
  });
});
