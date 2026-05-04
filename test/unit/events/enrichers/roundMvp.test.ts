import { describe, expect, it } from "vitest";
import {
  enrichRoundMvp,
  type RoundMvpEvent,
} from "../../../../src/events/enrichers/roundMvp.js";
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
    name: "round_mvp",
    eventId: 27,
    data: Object.freeze(data),
  };
}

describe("enrichRoundMvp", () => {
  it("happy path: resolves player, surfaces reason, freezes payload", () => {
    const player = { slot: 5 } as Player;
    const ctx = makeCtx(new Map([[3, player]]));

    const result = enrichRoundMvp(
      makeRaw({ userid: 3, reason: 1 }),
      ctx,
    ) as Readonly<RoundMvpEvent>;

    expect(result).not.toBeNull();
    expect(result.eventName).toBe("round_mvp");
    expect(result.eventId).toBe(27);
    expect(result.player).toBe(player);
    expect(result.reason).toBe(1);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichRoundMvp(
      makeRaw({ userid: 999, reason: 1 }),
      ctx,
    );
    expect(result).toBeNull();
  });

  it("coerces missing reason to 0", () => {
    const player = { slot: 5 } as Player;
    const ctx = makeCtx(new Map([[3, player]]));
    const result = enrichRoundMvp(makeRaw({ userid: 3 }), ctx) as Readonly<RoundMvpEvent>;
    expect(result.reason).toBe(0);
  });
});
