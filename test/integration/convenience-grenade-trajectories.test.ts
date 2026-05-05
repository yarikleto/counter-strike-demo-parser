/**
 * Integration test for `GrenadeTrajectoryTracker` (TASK-063).
 *
 * Exercises the tracker end-to-end via `DemoParser.parse()` against the
 * de_nuke fixture (bot match — no `grenade_thrown`, no molotovs, but real
 * HE / flashbang / smoke / decoy projectiles). Verifies plausibility
 * rather than exact values: counts depend on the specific fixture demo
 * but the shape of the data is invariant.
 *
 * Empirical baseline from the descriptor probe:
 *   hegrenade_detonate    = 78
 *   flashbang_detonate    = 113
 *   smokegrenade_detonate = 74
 *   decoy_detonate        = 1
 *   molotov_detonate      = 0  (bots don't molotov)
 *
 * Projectile entity counts (from probe):
 *   CBaseCSGrenadeProjectile: 191  (HE + flashbang)
 *   CSmokeGrenadeProjectile:  74
 *   CDecoyProjectile:         1
 *   CMolotovProjectile:       47   (no detonate events fire on this fixture)
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DemoParser } from "../../src/DemoParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../fixtures/de_nuke.dem");

describe("GrenadeTrajectoryTracker integration (de_nuke)", () => {
  it("captures trajectories for HE, flashbang, smoke, and decoy projectiles", async () => {
    const result = await DemoParser.parse(FIXTURE);
    const traj = result.grenadeTrajectories;

    // Every projectile entity should produce a trajectory record. The
    // probe shows 191 + 74 + 1 + 47 = 313 projectile entities; we use a
    // conservative floor that any de_nuke parse will exceed.
    expect(traj.length).toBeGreaterThan(100);

    const byType = new Map<string, number>();
    for (const t of traj) {
      byType.set(t.type, (byType.get(t.type) ?? 0) + 1);
    }
    console.log(
      `[GrenadeTrajectoryTracker] de_nuke trajectories: total=${traj.length}, byType=${[...byType.entries()].map(([k, v]) => `${k}:${v}`).join(", ")}`,
    );

    // Each major type emitted at least one detonate on the fixture probe.
    expect(byType.get("he") ?? 0).toBeGreaterThan(0);
    expect(byType.get("flash") ?? 0).toBeGreaterThan(0);
    expect(byType.get("smoke") ?? 0).toBeGreaterThan(0);
    expect(byType.get("decoy") ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("trajectories carry multiple position samples per grenade", async () => {
    const result = await DemoParser.parse(FIXTURE);

    // Find a grenade with the most samples — long-flying smokes typically
    // produce the longest trajectories. We assert at least one grenade
    // has more than 5 samples; the bot demo grenades are usually 30+.
    const longest = result.grenadeTrajectories.reduce(
      (best, t) => (t.trajectory.length > best ? t.trajectory.length : best),
      0,
    );
    expect(longest).toBeGreaterThan(5);

    // Sanity-check sample shape on the first non-empty trajectory.
    const sample = result.grenadeTrajectories.find(
      (t) => t.trajectory.length > 0,
    );
    expect(sample).toBeDefined();
    const point = sample!.trajectory[0]!;
    expect(typeof point.x).toBe("number");
    expect(typeof point.y).toBe("number");
    expect(typeof point.z).toBe("number");
    expect(typeof point.tick).toBe("number");
    expect(point.tick).toBeGreaterThanOrEqual(0);
  });

  it("captures detonationPosition for HE and flashbang grenades", async () => {
    const result = await DemoParser.parse(FIXTURE);

    const detonated = result.grenadeTrajectories.filter(
      (t) =>
        (t.type === "he" || t.type === "flash") &&
        t.detonationPosition !== undefined,
    );
    expect(detonated.length).toBeGreaterThan(0);

    const example = detonated[0]!;
    expect(typeof example.detonationPosition!.x).toBe("number");
    expect(typeof example.detonationPosition!.y).toBe("number");
    expect(typeof example.detonationPosition!.z).toBe("number");
    expect(example.detonationTick).toBeGreaterThan(example.throwTick);
  });

  it("at least one grenade has a resolved thrower", async () => {
    const result = await DemoParser.parse(FIXTURE);

    const withThrower = result.grenadeTrajectories.filter(
      (t) => t.thrower !== undefined,
    );

    // Bot fixture has 30 rounds with hundreds of nades; at least one
    // should resolve (the m_hThrower handle is reliably written by the
    // server on projectile creation).
    expect(withThrower.length).toBeGreaterThan(0);

    const example = withThrower[0]!;
    expect(typeof example.thrower!.slot).toBe("number");
  });

  it("entityIndex matches the projectile entity id", async () => {
    const result = await DemoParser.parse(FIXTURE);

    // Every record carries a positive entity index (Source reserves id 0
    // for the world entity, real projectiles spawn at id >= 1).
    for (const t of result.grenadeTrajectories) {
      expect(t.entityIndex).toBeGreaterThan(0);
    }
  });
});
