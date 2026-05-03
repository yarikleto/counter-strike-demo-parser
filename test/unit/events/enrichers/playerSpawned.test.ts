import { describe, expect, it } from "vitest";
import { enrichPlayerSpawned } from "../../../../src/events/enrichers/playerSpawned.js";
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
    name: "player_spawn",
    eventId: 20,
    data: Object.freeze(data),
  };
}

describe("enrichPlayerSpawned", () => {
  it("happy path: resolves player and surfaces inRestart", () => {
    const player = { slot: 2 } as Player;
    const ctx = makeCtx(new Map([[22, player]]));

    const result = enrichPlayerSpawned(
      makeRaw({ userid: 22, inrestart: true }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("player_spawn");
    expect(result!.player).toBe(player);
    expect(result!.inRestart).toBe(true);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("inRestart false on a normal round spawn", () => {
    const player = { slot: 2 } as Player;
    const ctx = makeCtx(new Map([[22, player]]));

    const result = enrichPlayerSpawned(
      makeRaw({ userid: 22, inrestart: false }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.inRestart).toBe(false);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichPlayerSpawned(
      makeRaw({ userid: 999, inrestart: false }),
      ctx,
    );
    expect(result).toBeNull();
  });
});
