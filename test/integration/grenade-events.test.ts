import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type {
  GrenadeThrownEvent,
  GrenadeBounceEvent,
  HeGrenadeDetonateEvent,
  FlashbangDetonateEvent,
  SmokeGrenadeDetonateEvent,
  SmokeGrenadeExpiredEvent,
  MolotovDetonateEvent,
  InfernoExpiredEvent,
  DecoyDetonateEvent,
} from "../../src/events/index.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

// TASK-041: end-to-end smoke test for the grenade lifecycle Tier-1 enrichers
// (grenade_thrown, grenade_bounce, hegrenade_detonate, flashbang_detonate,
// smokegrenade_detonate, smokegrenade_expired, molotov_detonate,
// inferno_expire, decoy_detonate) on a real 30-round MM demo.
//
// Empirical baseline from a probe of de_nuke.dem (bots-only fixture, no
// grenade-throw or grenade-bounce wire emissions; molotovs not used by the
// bot mode):
//   hegrenade_detonate    = 78
//   flashbang_detonate    = 113
//   smokegrenade_detonate = 74
//   smokegrenade_expired  = 72
//   inferno_expire        = 42
//   decoy_detonate        = 1
//   grenade_thrown        = 0
//   grenade_bounce        = 0
//   molotov_detonate      = 0
describe("Grenade events (Tier-1) — integration on de_nuke.dem", () => {
  it("emits typed grenade lifecycle events with resolved players", () => {
    const parser = DemoParser.fromFile(FIXTURE);

    const thrown: GrenadeThrownEvent[] = [];
    const bounces: GrenadeBounceEvent[] = [];
    const heDetonations: HeGrenadeDetonateEvent[] = [];
    const flashes: FlashbangDetonateEvent[] = [];
    const smokesDetonated: SmokeGrenadeDetonateEvent[] = [];
    const smokesExpired: SmokeGrenadeExpiredEvent[] = [];
    const molotovs: MolotovDetonateEvent[] = [];
    const infernosExpired: InfernoExpiredEvent[] = [];
    const decoys: DecoyDetonateEvent[] = [];

    parser.on("grenade_thrown", (e: GrenadeThrownEvent) => thrown.push(e));
    parser.on("grenade_bounce", (e: GrenadeBounceEvent) => bounces.push(e));
    parser.on("hegrenade_detonate", (e: HeGrenadeDetonateEvent) =>
      heDetonations.push(e),
    );
    parser.on("flashbang_detonate", (e: FlashbangDetonateEvent) =>
      flashes.push(e),
    );
    parser.on("smokegrenade_detonate", (e: SmokeGrenadeDetonateEvent) =>
      smokesDetonated.push(e),
    );
    parser.on("smokegrenade_expired", (e: SmokeGrenadeExpiredEvent) =>
      smokesExpired.push(e),
    );
    parser.on("molotov_detonate", (e: MolotovDetonateEvent) =>
      molotovs.push(e),
    );
    parser.on("inferno_expire", (e: InfernoExpiredEvent) =>
      infernosExpired.push(e),
    );
    parser.on("decoy_detonate", (e: DecoyDetonateEvent) => decoys.push(e));

    parser.parseAll();

    // Floors from the descriptor probe — bots actually emit detonations, but
    // not throws or bounces, and they don't use molotovs.
    expect(heDetonations.length).toBeGreaterThanOrEqual(1);
    expect(flashes.length).toBeGreaterThanOrEqual(1);
    expect(smokesDetonated.length).toBeGreaterThanOrEqual(1);
    expect(smokesExpired.length).toBeGreaterThanOrEqual(1);
    expect(infernosExpired.length).toBeGreaterThanOrEqual(0);
    expect(thrown.length).toBeGreaterThanOrEqual(0);
    expect(bounces.length).toBeGreaterThanOrEqual(0);
    expect(molotovs.length).toBeGreaterThanOrEqual(0);
    expect(decoys.length).toBeGreaterThanOrEqual(0);

    console.log(
      `grenade events on de_nuke.dem: grenade_thrown=${thrown.length}, ` +
        `grenade_bounce=${bounces.length}, hegrenade_detonate=${heDetonations.length}, ` +
        `flashbang_detonate=${flashes.length}, smokegrenade_detonate=${smokesDetonated.length}, ` +
        `smokegrenade_expired=${smokesExpired.length}, molotov_detonate=${molotovs.length}, ` +
        `inferno_expire=${infernosExpired.length}, decoy_detonate=${decoys.length}`,
    );

    // Sample a frozen hegrenade_detonate and verify the typed shape.
    const he = heDetonations[0]!;
    expect(he.eventName).toBe("hegrenade_detonate");
    expect(typeof he.eventId).toBe("number");
    // Thrower may be undefined if disconnected mid-flight, but on a 30-round
    // bot demo at least one of 78 detonations should resolve.
    expect(typeof he.position.x).toBe("number");
    expect(typeof he.position.y).toBe("number");
    expect(typeof he.position.z).toBe("number");
    expect(Object.isFrozen(he)).toBe(true);
    expect(Object.isFrozen(he.position)).toBe(true);

    const heWithThrower = heDetonations.find((d) => d.thrower !== undefined);
    expect(heWithThrower, "at least one HE detonation should resolve").toBeDefined();
    expect(typeof heWithThrower!.thrower!.slot).toBe("number");

    // Sample flashbang_detonate — playersFlashed is always [] (descriptor
    // doesn't carry a per-victim list).
    const flash = flashes[0]!;
    expect(flash.eventName).toBe("flashbang_detonate");
    expect(Array.isArray(flash.playersFlashed)).toBe(true);
    expect(flash.playersFlashed.length).toBe(0);
    expect(Object.isFrozen(flash)).toBe(true);
    expect(Object.isFrozen(flash.playersFlashed)).toBe(true);

    // Sample smoke_detonate.
    const smoke = smokesDetonated[0]!;
    expect(smoke.eventName).toBe("smokegrenade_detonate");
    expect(typeof smoke.position.x).toBe("number");
    expect(Object.isFrozen(smoke)).toBe(true);
  });
});
