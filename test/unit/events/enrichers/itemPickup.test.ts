import { describe, expect, it } from "vitest";
import { enrichItemPickup } from "../../../../src/events/enrichers/itemPickup.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { Player } from "../../../../src/state/Player.js";

// `item_pickup` descriptor (verified against de_nuke.dem in this PR's
// integration test): { userid: short, item: string, silent: bool,
// defindex: long }. The wire field name is `item` (a CS:GO descriptor-keyed
// string), so the Tier-1 typed payload surfaces it under the same name. The
// enricher resolves userid -> Player and surfaces `item` directly. Returns
// null when the player does not resolve.
function makeCtx(
  resolvePlayer: (uid: number) => Player | undefined,
): EnricherContext {
  return {
    players: [],
    entities: undefined,
    gameRules: undefined,
    teams: [],
    userInfoIndex: {
      entitySlotForUserId: () => undefined,
      infoForUserId: () => undefined,
      userIdForEntitySlot: () => undefined,
      refresh: () => undefined,
    },
    resolvePlayer,
  } as unknown as EnricherContext;
}

function makeRaw(
  data: Record<string, string | number | boolean>,
): DecodedGameEvent {
  return {
    name: "item_pickup",
    eventId: 60,
    data: Object.freeze(data),
  };
}

describe("enrichItemPickup", () => {
  it("returns the typed event when the player resolves", () => {
    const player = { slot: 3 } as Player;
    const ctx = makeCtx((uid) => (uid === 42 ? player : undefined));
    const raw = makeRaw({
      userid: 42,
      item: "ak47",
      silent: false,
      defindex: 7,
    });

    const result = enrichItemPickup(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.player).toBe(player);
    expect(result!.item).toBe("ak47");
    expect(result!.eventName).toBe("item_pickup");
    expect(result!.eventId).toBe(60);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns null when the player does not resolve", () => {
    const ctx = makeCtx(() => undefined);
    const raw = makeRaw({ userid: 999, item: "knife" });

    expect(enrichItemPickup(raw, ctx)).toBeNull();
  });

  it("defaults item to empty string when the wire payload omits it", () => {
    const player = { slot: 1 } as Player;
    const ctx = makeCtx(() => player);
    const raw = makeRaw({ userid: 7 });

    const result = enrichItemPickup(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.item).toBe("");
  });
});
