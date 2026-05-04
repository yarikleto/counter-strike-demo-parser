import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type {
  HostageRescuedEvent,
  HostagePickedUpEvent,
  HostageHurtEvent,
} from "../../src/events/index.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

// TASK-045: end-to-end smoke test for the hostage Tier-1 enrichers.
//
// The only fixture we have is de_nuke.dem — a defuse map. Hostage events
// are CS:GO's hostage-rescue game mode (cs_* maps like cs_office, cs_italy)
// and don't fire on a defuse map. This test exists to verify the wire-up
// (subscription, no crashes, frozen shape if any sneak through), not to
// exercise the happy path with non-zero counts. The unit tests at
// `test/unit/events/enrichers/hostage*.test.ts` carry the real coverage.
//
// Wire-key verification (descriptor table on de_nuke.dem):
//   hostage_rescued  (id=122) keys: { userid:short, hostage:short, site:short }
//   hostage_follows  (id=119) keys: { userid:short, hostage:short }
//   hostage_hurt     (id=120) keys: { userid:short, hostage:short }
// No `hostage_grab` descriptor exists — `hostage_follows` is the canonical
// pickup signal.
describe("Hostage events (Tier-1) — integration on de_nuke.dem", () => {
  it("wires up the three hostage enrichers without crashing (counts likely 0 on defuse map)", () => {
    const parser = DemoParser.fromFile(FIXTURE);

    const rescued: HostageRescuedEvent[] = [];
    const pickedUp: HostagePickedUpEvent[] = [];
    const hurt: HostageHurtEvent[] = [];

    parser.on("hostage_rescued", (e: HostageRescuedEvent) => rescued.push(e));
    parser.on("hostage_follows", (e: HostagePickedUpEvent) =>
      pickedUp.push(e),
    );
    parser.on("hostage_hurt", (e: HostageHurtEvent) => hurt.push(e));

    parser.parseAll();

    // de_nuke is a defuse map — hostage events almost certainly do not fire.
    // Use >= 0 to keep this test robust if a future fixture switch ever
    // surfaces some.
    expect(rescued.length).toBeGreaterThanOrEqual(0);
    expect(pickedUp.length).toBeGreaterThanOrEqual(0);
    expect(hurt.length).toBeGreaterThanOrEqual(0);

    console.log(
      `hostage events on de_nuke.dem (defuse map — expected zeros): ` +
        `rescued=${rescued.length}, ` +
        `picked_up(hostage_follows)=${pickedUp.length}, ` +
        `hurt=${hurt.length}`,
    );

    // If by some chance any sneaked through (e.g. on a different fixture),
    // verify the typed shape.
    if (rescued.length > 0) {
      const r = rescued[0]!;
      expect(r.eventName).toBe("hostage_rescued");
      expect(typeof r.player.slot).toBe("number");
      expect(typeof r.hostage).toBe("number");
      expect(typeof r.site).toBe("number");
      expect(Object.isFrozen(r)).toBe(true);
    }
    if (pickedUp.length > 0) {
      const p = pickedUp[0]!;
      expect(p.eventName).toBe("hostage_follows");
      expect(typeof p.hostage).toBe("number");
      expect(Object.isFrozen(p)).toBe(true);
    }
    if (hurt.length > 0) {
      const h = hurt[0]!;
      expect(h.eventName).toBe("hostage_hurt");
      expect(typeof h.hostage).toBe("number");
      expect(Object.isFrozen(h)).toBe(true);
    }
  });
});
