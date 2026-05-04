import { describe, expect, it } from "vitest";
import { enrichHostageHurt } from "../../../../src/events/enrichers/hostageHurt.js";
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
    name: "hostage_hurt",
    eventId: 120,
    data: Object.freeze(data),
  };
}

describe("enrichHostageHurt", () => {
  it("happy path: resolves player, surfaces hostage, freezes payload", () => {
    const attacker = { slot: 2 } as Player;
    const ctx = makeCtx(new Map([[19, attacker]]));

    const result = enrichHostageHurt(
      makeRaw({ userid: 19, hostage: 81 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("hostage_hurt");
    expect(result!.eventId).toBe(120);
    expect(result!.player).toBe(attacker);
    expect(result!.hostage).toBe(81);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichHostageHurt(
      makeRaw({ userid: 999, hostage: 81 }),
      ctx,
    );
    expect(result).toBeNull();
  });

  it("defaults hostage to 0 when missing/non-numeric", () => {
    const attacker = { slot: 2 } as Player;
    const ctx = makeCtx(new Map([[19, attacker]]));

    const result = enrichHostageHurt(makeRaw({ userid: 19 }), ctx);

    expect(result).not.toBeNull();
    expect(result!.hostage).toBe(0);
  });
});
