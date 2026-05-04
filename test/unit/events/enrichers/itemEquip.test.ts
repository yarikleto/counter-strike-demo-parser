import { describe, expect, it } from "vitest";
import { enrichItemEquip } from "../../../../src/events/enrichers/itemEquip.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { Player } from "../../../../src/state/Player.js";

// `item_equip` descriptor (verified against de_nuke.dem in this PR's
// integration test): { userid: short, item: string, defindex: long,
// canzoom: bool, hassilencer: bool, issilenced: bool, hastracers: bool,
// weptype: short, ispainted: bool }. Wire field for the weapon class
// name is `item`. The Tier-1 enricher resolves userid -> Player and
// surfaces `item` directly. Returns null when the player does not resolve.
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
    name: "item_equip",
    eventId: 62,
    data: Object.freeze(data),
  };
}

describe("enrichItemEquip", () => {
  it("returns the typed event when the player resolves", () => {
    const player = { slot: 9 } as Player;
    const ctx = makeCtx((uid) => (uid === 42 ? player : undefined));
    const raw = makeRaw({
      userid: 42,
      item: "knife",
      defindex: 59,
      canzoom: false,
      hassilencer: false,
      issilenced: false,
      hastracers: false,
      weptype: 0,
      ispainted: false,
    });

    const result = enrichItemEquip(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.player).toBe(player);
    expect(result!.item).toBe("knife");
    expect(result!.eventName).toBe("item_equip");
    expect(result!.eventId).toBe(62);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns null when the player does not resolve", () => {
    const ctx = makeCtx(() => undefined);
    const raw = makeRaw({ userid: 999, item: "weapon_glock" });

    expect(enrichItemEquip(raw, ctx)).toBeNull();
  });

  it("defaults item to empty string when the wire payload omits it", () => {
    const player = { slot: 1 } as Player;
    const ctx = makeCtx(() => player);
    const raw = makeRaw({ userid: 7 });

    const result = enrichItemEquip(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.item).toBe("");
  });
});
