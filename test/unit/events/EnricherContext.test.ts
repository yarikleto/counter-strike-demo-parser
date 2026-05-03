import { describe, expect, it } from "vitest";
import { buildEnricherContext } from "../../../src/events/EnricherContext.js";
import type { DemoParser } from "../../../src/DemoParser.js";
import type { Player } from "../../../src/state/Player.js";

// EnricherContext only touches a small surface of DemoParser/Player, so we
// stub the bare minimum and cast through `unknown` rather than constructing
// real overlays (which would require a parsed demo and an entity store).
function makeFakeParser(opts: {
  players: Pick<Player, "slot">[];
  userIdToSlot: Map<number, number>;
}): DemoParser {
  return {
    players: opts.players,
    entities: undefined,
    gameRules: undefined,
    teams: [],
    userInfoIndex: {
      entitySlotForUserId: (uid: number) => opts.userIdToSlot.get(uid),
      infoForUserId: () => undefined,
      userIdForEntitySlot: () => undefined,
      refresh: () => undefined,
    },
  } as unknown as DemoParser;
}

describe("EnricherContext.resolvePlayer", () => {
  it("returns the matching Player when userid → slot → Player exists", () => {
    const player = { slot: 5 } as Player;
    const ctx = buildEnricherContext(
      makeFakeParser({
        players: [{ slot: 1 } as Player, player, { slot: 9 } as Player],
        userIdToSlot: new Map([[42, 5]]),
      }),
    );

    expect(ctx.resolvePlayer(42)).toBe(player);
  });

  it("returns undefined when the userid is unknown to userInfoIndex", () => {
    const ctx = buildEnricherContext(
      makeFakeParser({
        players: [{ slot: 1 } as Player],
        userIdToSlot: new Map([[42, 1]]),
      }),
    );

    expect(ctx.resolvePlayer(999)).toBeUndefined();
  });

  it("returns undefined when the resolved slot has no live Player overlay", () => {
    const ctx = buildEnricherContext(
      makeFakeParser({
        players: [{ slot: 1 } as Player, { slot: 2 } as Player],
        userIdToSlot: new Map([[42, 7]]),
      }),
    );

    expect(ctx.resolvePlayer(42)).toBeUndefined();
  });
});
