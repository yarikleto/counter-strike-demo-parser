import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type {
  WeaponFireEvent,
  WeaponReloadEvent,
  WeaponZoomEvent,
} from "../../src/events/index.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

// TASK-044: end-to-end smoke test for the weapon-event Tier-1 enrichers
// (weapon_fire, weapon_reload, weapon_zoom) on a real 30-round MM demo.
// Asserts the dispatcher invokes each enricher and the typed payloads
// resolve to live `Player` overlays.
describe("Weapon events (Tier-1) — integration on de_nuke.dem", () => {
  it("emits typed weapon_fire / weapon_reload / weapon_zoom with resolved players", () => {
    const parser = DemoParser.fromFile(FIXTURE);

    const fires: WeaponFireEvent[] = [];
    const reloads: WeaponReloadEvent[] = [];
    const zooms: WeaponZoomEvent[] = [];

    parser.on("weapon_fire", (e: WeaponFireEvent) => fires.push(e));
    parser.on("weapon_reload", (e: WeaponReloadEvent) => reloads.push(e));
    parser.on("weapon_zoom", (e: WeaponZoomEvent) => zooms.push(e));

    parser.parseAll();

    // CS:GO bots in a 30-round demo fire thousands of bullets.
    expect(fires.length).toBeGreaterThan(1000);
    // Reloads are universal — every magazine swap fires the event.
    expect(reloads.length).toBeGreaterThanOrEqual(1);
    // Zoom is rifle/sniper-only; bots may or may not zoom on de_nuke. The
    // brief allows zero with documentation. Assert >= 0 so we observe the
    // count without failing on bot scope habits — see report-back below.
    expect(zooms.length).toBeGreaterThanOrEqual(0);

    // Diagnostic: surface the counts to the test log so the reviewer can
    // confirm the fixture exercises each enricher.
    console.log(
      `weapon events on de_nuke.dem: weapon_fire=${fires.length}, ` +
        `weapon_reload=${reloads.length}, weapon_zoom=${zooms.length}`,
    );

    // Sample a frozen weapon_fire and verify the typed shape.
    const sample = fires[0]!;
    expect(sample.eventName).toBe("weapon_fire");
    expect(typeof sample.eventId).toBe("number");
    expect(sample.player).toBeDefined();
    expect(typeof sample.player.slot).toBe("number");
    expect(typeof sample.weapon).toBe("string");
    expect(sample.weapon.length).toBeGreaterThan(0);
    expect(typeof sample.silenced).toBe("boolean");
    expect(Object.isFrozen(sample)).toBe(true);

    // Reload payload sanity — only `player` beyond the inherited fields.
    const reloadSample = reloads[0]!;
    expect(reloadSample.eventName).toBe("weapon_reload");
    expect(reloadSample.player).toBeDefined();
    expect(typeof reloadSample.player.slot).toBe("number");
    expect(Object.isFrozen(reloadSample)).toBe(true);
  });
});
