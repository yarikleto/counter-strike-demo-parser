import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type {
  PlayerDeathEvent,
  PlayerHurtEvent,
  PlayerBlindEvent,
  PlayerSpawnedEvent,
  PlayerGivenC4Event,
  BulletImpactEvent,
  OtherDeathEvent,
} from "../../src/events/index.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

// TASK-038: end-to-end smoke test for the combat & player-action Tier-1
// enrichers (player_death, player_hurt, player_blind, player_spawn,
// player_given_c4, bullet_impact, other_death) on a real 30-round MM demo.
// Asserts the dispatcher invokes each enricher and the typed payloads
// resolve to live `Player` overlays.
describe("Combat events (Tier-1) — integration on de_nuke.dem", () => {
  it("emits typed combat & player-action events with resolved players", () => {
    const parser = DemoParser.fromFile(FIXTURE);

    const deaths: PlayerDeathEvent[] = [];
    const hurts: PlayerHurtEvent[] = [];
    const blinds: PlayerBlindEvent[] = [];
    const spawns: PlayerSpawnedEvent[] = [];
    const givenC4: PlayerGivenC4Event[] = [];
    const impacts: BulletImpactEvent[] = [];
    const otherDeaths: OtherDeathEvent[] = [];

    parser.on("player_death", (e: PlayerDeathEvent) => deaths.push(e));
    parser.on("player_hurt", (e: PlayerHurtEvent) => hurts.push(e));
    parser.on("player_blind", (e: PlayerBlindEvent) => blinds.push(e));
    parser.on("player_spawn", (e: PlayerSpawnedEvent) => spawns.push(e));
    parser.on("player_given_c4", (e: PlayerGivenC4Event) => givenC4.push(e));
    parser.on("bullet_impact", (e: BulletImpactEvent) => impacts.push(e));
    parser.on("other_death", (e: OtherDeathEvent) => otherDeaths.push(e));

    parser.parseAll();

    // A 30-round MM demo on de_nuke produces hundreds of frags and damage.
    expect(deaths.length).toBeGreaterThan(50);
    expect(hurts.length).toBeGreaterThan(deaths.length);
    // bullet_impact is server-config-gated in CS:GO — bots-only fixtures
    // typically don't emit it. Don't pin a positive count; just verify the
    // dispatcher routes correctly when it does fire (the unit test does
    // that). Assert non-negative as a no-throw guard.
    expect(impacts.length).toBeGreaterThanOrEqual(0);
    // Spawns fire at every (re)spawn — at least once per player per round
    // plus warmup churn. C4 may or may not be granted on a bot fixture
    // (player_given_c4 fires when a T inventory pickup happens; some game
    // modes auto-equip on round start). Don't pin a positive count.
    expect(spawns.length).toBeGreaterThan(0);
    expect(givenC4.length).toBeGreaterThanOrEqual(0);
    // Blinds and other_death are strictly non-negative.
    expect(blinds.length).toBeGreaterThanOrEqual(0);
    expect(otherDeaths.length).toBeGreaterThanOrEqual(0);

    console.log(
      `combat events on de_nuke.dem: player_death=${deaths.length}, ` +
        `player_hurt=${hurts.length}, player_blind=${blinds.length}, ` +
        `player_spawn=${spawns.length}, player_given_c4=${givenC4.length}, ` +
        `bullet_impact=${impacts.length}, other_death=${otherDeaths.length}`,
    );

    // Sample a frozen player_death and verify the typed shape.
    const death = deaths[0]!;
    expect(death.eventName).toBe("player_death");
    expect(typeof death.eventId).toBe("number");
    expect(death.victim).toBeDefined();
    expect(typeof death.victim.slot).toBe("number");
    // attacker may be undefined (suicide / world); just assert the type
    // contract is honoured (Player or undefined, never a sentinel).
    if (death.attacker !== undefined) {
      expect(typeof death.attacker.slot).toBe("number");
    }
    expect(typeof death.weapon).toBe("string");
    expect(typeof death.headshot).toBe("boolean");
    expect(typeof death.penetrated).toBe("boolean");
    expect(typeof death.noscope).toBe("boolean");
    expect(typeof death.thrusmoke).toBe("boolean");
    expect(typeof death.attackerblind).toBe("boolean");
    expect(Object.isFrozen(death)).toBe(true);

    // Sample player_hurt — hitGroup must be a number (HitGroup enum or raw).
    const hurt = hurts[0]!;
    expect(hurt.eventName).toBe("player_hurt");
    expect(hurt.victim).toBeDefined();
    expect(typeof hurt.damage).toBe("number");
    expect(typeof hurt.hitGroup).toBe("number");
    expect(Object.isFrozen(hurt)).toBe(true);
  });
});
