import { describe, expect, it } from "vitest";
import {
  enrichBotTakeover,
  type BotTakeoverEvent,
} from "../../../../src/events/enrichers/botTakeover.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";
import type { Player } from "../../../../src/state/Player.js";

function makeCtx(players: Map<number, Player>): EnricherContext {
  return {
    players: [...players.values()],
    teams: [],
    gameRules: undefined,
    entities: undefined,
    userInfoIndex: {} as EnricherContext["userInfoIndex"],
    resolvePlayer: (uid: number) => players.get(uid),
  } as unknown as EnricherContext;
}

function makeRaw(
  data: Record<string, string | number | boolean>,
): DecodedGameEvent {
  return {
    name: "bot_takeover",
    eventId: 19,
    data: Object.freeze(data),
  };
}

describe("enrichBotTakeover", () => {
  it("happy path: resolves player, surfaces botId, freezes payload", () => {
    const player = { slot: 7 } as Player;
    const ctx = makeCtx(new Map([[12, player]]));

    const result = enrichBotTakeover(
      makeRaw({ userid: 12, botid: 5, index: 5 }),
      ctx,
    ) as Readonly<BotTakeoverEvent>;

    expect(result).not.toBeNull();
    expect(result.eventName).toBe("bot_takeover");
    expect(result.eventId).toBe(19);
    expect(result.player).toBe(player);
    expect(result.botId).toBe(5);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichBotTakeover(
      makeRaw({ userid: 999, botid: 5, index: 5 }),
      ctx,
    );
    expect(result).toBeNull();
  });

  it("coerces missing botid to 0", () => {
    const player = { slot: 7 } as Player;
    const ctx = makeCtx(new Map([[12, player]]));
    const result = enrichBotTakeover(
      makeRaw({ userid: 12 }),
      ctx,
    ) as Readonly<BotTakeoverEvent>;
    expect(result.botId).toBe(0);
  });
});
