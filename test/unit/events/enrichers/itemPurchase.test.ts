import { describe, expect, it } from "vitest";
import { enrichItemPurchase } from "../../../../src/events/enrichers/itemPurchase.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { Player } from "../../../../src/state/Player.js";

// `item_purchase` descriptor (verified against de_nuke.dem in this PR's
// integration test): { userid: short, team: short, loadout: short,
// weapon: string }. NOTE the wire field is named `weapon` here — unlike the
// sibling `item_pickup` and `item_equip` events which carry `item`. CS:GO
// descriptor key names are descriptor-table-keyed strings and the engine
// is not consistent across events. The Tier-1 contract (TASK-043) is to
// expose all three under the public field name `item: string` regardless,
// so this enricher reads `raw.data.weapon` and surfaces it as `item`. The
// enricher returns null when the player does not resolve.
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
    name: "item_purchase",
    eventId: 61,
    data: Object.freeze(data),
  };
}

describe("enrichItemPurchase", () => {
  it("returns the typed event with the wire `weapon` field surfaced as `item`", () => {
    const player = { slot: 5 } as Player;
    const ctx = makeCtx((uid) => (uid === 42 ? player : undefined));
    const raw = makeRaw({
      userid: 42,
      team: 2,
      loadout: 0,
      weapon: "weapon_ak47",
    });

    const result = enrichItemPurchase(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.player).toBe(player);
    expect(result!.item).toBe("weapon_ak47");
    expect(result!.eventName).toBe("item_purchase");
    expect(result!.eventId).toBe(61);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns null when the player does not resolve", () => {
    const ctx = makeCtx(() => undefined);
    const raw = makeRaw({ userid: 999, weapon: "weapon_awp" });

    expect(enrichItemPurchase(raw, ctx)).toBeNull();
  });

  it("defaults item to empty string when the wire payload omits weapon", () => {
    const player = { slot: 1 } as Player;
    const ctx = makeCtx(() => player);
    const raw = makeRaw({ userid: 7 });

    const result = enrichItemPurchase(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.item).toBe("");
  });
});
