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

// resolvePlayer bridges the (table-slot 0..63) → (entity-id 1..64) gap by
// adding 1 to the userInfoIndex slot before scanning Players. The tests
// below encode this contract: a userid that maps to tableSlot N must
// resolve to the Player whose entity slot is N+1.
describe("EnricherContext.resolvePlayer", () => {
  it("returns the Player whose entity slot is tableSlot + 1", () => {
    const player = { slot: 6 } as Player; // entity id 6 = tableSlot 5
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
        players: [{ slot: 2 } as Player], // tableSlot 1 -> entity 2
        userIdToSlot: new Map([[42, 1]]),
      }),
    );

    expect(ctx.resolvePlayer(999)).toBeUndefined();
  });

  it("returns undefined when no Player exists at tableSlot + 1", () => {
    const ctx = buildEnricherContext(
      makeFakeParser({
        players: [{ slot: 2 } as Player, { slot: 3 } as Player],
        // userid 42 → tableSlot 7 → entity 8, but no Player at entity 8.
        userIdToSlot: new Map([[42, 7]]),
      }),
    );

    expect(ctx.resolvePlayer(42)).toBeUndefined();
  });
});
