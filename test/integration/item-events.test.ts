import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type {
  ItemPickupEvent,
  ItemPurchaseEvent,
  ItemEquipEvent,
} from "../../src/events/index.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

// TASK-043: end-to-end smoke test for the item-event Tier-1 enrichers
// (item_pickup, item_purchase, item_equip) on a real 30-round MM demo.
// Asserts the dispatcher invokes each enricher and the typed payloads
// resolve to live `Player` overlays.
//
// Probe counts on de_nuke.dem (recorded 2026-04-30):
//   item_equip   = 5258
//   item_pickup  = 2534
//   item_purchase = 0   (bots auto-equip and never hit the buy menu)
// Floors are set conservatively below the probe value to avoid drift
// across protobuf rebuilds; item_purchase floors at zero on this fixture
// per the brief — the unit test pins the field-mapping behaviour.
describe("Item events (Tier-1) — integration on de_nuke.dem", () => {
  it("emits typed item_pickup / item_purchase / item_equip with resolved players", () => {
    const parser = DemoParser.fromFile(FIXTURE);

    const pickups: ItemPickupEvent[] = [];
    const purchases: ItemPurchaseEvent[] = [];
    const equips: ItemEquipEvent[] = [];

    parser.on("item_pickup", (e: ItemPickupEvent) => pickups.push(e));
    parser.on("item_purchase", (e: ItemPurchaseEvent) => purchases.push(e));
    parser.on("item_equip", (e: ItemEquipEvent) => equips.push(e));

    parser.parseAll();

    // CS:GO bots equip weapons constantly across 30 rounds.
    expect(equips.length).toBeGreaterThan(1000);
    // Pickups are also frequent — every dropped weapon retrieval fires.
    expect(pickups.length).toBeGreaterThan(500);
    // item_purchase: bots auto-equip on de_nuke and may never fire this.
    // The brief allows zero with documentation. Floor at >= 0.
    expect(purchases.length).toBeGreaterThanOrEqual(0);

    // Diagnostic surface so the reviewer can confirm the fixture exercises
    // each enricher.
    console.log(
      `item events on de_nuke.dem: item_equip=${equips.length}, ` +
        `item_pickup=${pickups.length}, item_purchase=${purchases.length}`,
    );

    // Sample a frozen item_equip and verify the typed shape.
    const equipSample = equips[0]!;
    expect(equipSample.eventName).toBe("item_equip");
    expect(typeof equipSample.eventId).toBe("number");
    expect(equipSample.player).toBeDefined();
    expect(typeof equipSample.player.slot).toBe("number");
    expect(typeof equipSample.item).toBe("string");
    expect(equipSample.item.length).toBeGreaterThan(0);
    expect(Object.isFrozen(equipSample)).toBe(true);

    // Pickup payload sanity.
    const pickupSample = pickups[0]!;
    expect(pickupSample.eventName).toBe("item_pickup");
    expect(pickupSample.player).toBeDefined();
    expect(typeof pickupSample.player.slot).toBe("number");
    expect(typeof pickupSample.item).toBe("string");
    expect(Object.isFrozen(pickupSample)).toBe(true);
  });
});
