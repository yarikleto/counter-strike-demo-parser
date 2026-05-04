import { describe, expect, it } from "vitest";
import { enrichHostageRescued } from "../../../../src/events/enrichers/hostageRescued.js";
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
    name: "hostage_rescued",
    eventId: 122,
    data: Object.freeze(data),
  };
}

describe("enrichHostageRescued", () => {
  it("happy path: resolves player, surfaces hostage and site, freezes payload", () => {
    const rescuer = { slot: 4 } as Player;
    const ctx = makeCtx(new Map([[42, rescuer]]));

    const result = enrichHostageRescued(
      makeRaw({ userid: 42, hostage: 81, site: 200 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("hostage_rescued");
    expect(result!.eventId).toBe(122);
    expect(result!.player).toBe(rescuer);
    expect(result!.hostage).toBe(81);
    expect(result!.site).toBe(200);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichHostageRescued(
      makeRaw({ userid: 999, hostage: 81, site: 200 }),
      ctx,
    );
    expect(result).toBeNull();
  });

  it("defaults hostage and site to 0 when missing/non-numeric", () => {
    const rescuer = { slot: 4 } as Player;
    const ctx = makeCtx(new Map([[42, rescuer]]));

    const result = enrichHostageRescued(makeRaw({ userid: 42 }), ctx);

    expect(result).not.toBeNull();
    expect(result!.hostage).toBe(0);
    expect(result!.site).toBe(0);
  });
});
