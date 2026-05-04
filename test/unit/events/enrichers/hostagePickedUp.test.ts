import { describe, expect, it } from "vitest";
import { enrichHostagePickedUp } from "../../../../src/events/enrichers/hostagePickedUp.js";
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
  // Wire key verified via the de_nuke descriptor table:
  //   hostage_follows (id=119): { userid:short, hostage:short }
  // (No `hostage_grab` descriptor exists in CS:GO's networked event list —
  // the rescue-mode pickup fires as `hostage_follows`.)
  return {
    name: "hostage_follows",
    eventId: 119,
    data: Object.freeze(data),
  };
}

describe("enrichHostagePickedUp", () => {
  it("happy path: resolves player, surfaces hostage, freezes payload", () => {
    const grabber = { slot: 7 } as Player;
    const ctx = makeCtx(new Map([[55, grabber]]));

    const result = enrichHostagePickedUp(
      makeRaw({ userid: 55, hostage: 81 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("hostage_follows");
    expect(result!.eventId).toBe(119);
    expect(result!.player).toBe(grabber);
    expect(result!.hostage).toBe(81);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichHostagePickedUp(
      makeRaw({ userid: 999, hostage: 81 }),
      ctx,
    );
    expect(result).toBeNull();
  });

  it("defaults hostage to 0 when missing/non-numeric", () => {
    const grabber = { slot: 7 } as Player;
    const ctx = makeCtx(new Map([[55, grabber]]));

    const result = enrichHostagePickedUp(makeRaw({ userid: 55 }), ctx);

    expect(result).not.toBeNull();
    expect(result!.hostage).toBe(0);
  });
});
