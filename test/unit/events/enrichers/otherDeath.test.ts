import { describe, expect, it } from "vitest";
import { enrichOtherDeath } from "../../../../src/events/enrichers/otherDeath.js";
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
    name: "other_death",
    eventId: 95,
    data: Object.freeze(data),
  };
}

describe("enrichOtherDeath", () => {
  it("happy path: resolves attacker, surfaces entityType and weapon", () => {
    const attacker = { slot: 1 } as Player;
    const ctx = makeCtx(new Map([[11, attacker]]));

    const result = enrichOtherDeath(
      makeRaw({
        otherid: 100,
        othertype: "chicken",
        attacker: 11,
        weapon: "deagle",
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("other_death");
    expect(result!.attacker).toBe(attacker);
    expect(result!.entityType).toBe("chicken");
    expect(result!.weapon).toBe("deagle");
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("attacker unresolved (world kill): attacker undefined, entity info still surfaces", () => {
    const ctx = makeCtx(new Map());

    const result = enrichOtherDeath(
      makeRaw({
        otherid: 100,
        othertype: "chicken",
        attacker: 0,
        weapon: "world",
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.attacker).toBeUndefined();
    expect(result!.entityType).toBe("chicken");
    expect(result!.weapon).toBe("world");
  });
});
