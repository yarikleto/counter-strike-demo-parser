import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type { DecodedGameEvent } from "../../src/events/GameEventDecoder.js";

const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("CSVCMsg_GameEvent — integration with real demo file", () => {
  it("emits 'gameEvent' for a sizable population of events on de_nuke.dem", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    let count = 0;
    parser.on("gameEvent", () => {
      count++;
    });

    parser.parseAll();

    // 30-round demos fire thousands of events: player_footstep alone is in
    // the hundreds, plus weapon_fire, player_hurt, etc. Floor at 1000 to
    // avoid pinning an exact count that would drift between server builds.
    expect(count).toBeGreaterThan(1000);
  });

  it("never emits 'gameEventDecodeError' on a well-formed demo (every event has a descriptor)", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    let errCount = 0;
    parser.on("gameEventDecodeError", () => {
      errCount++;
    });

    parser.parseAll();

    expect(errCount).toBe(0);
  });

  it("decodes at least one player_death with the expected key set and types", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    const playerDeaths: DecodedGameEvent[] = [];
    parser.on("gameEvent", (e: DecodedGameEvent) => {
      if (e.name === "player_death") {
        playerDeaths.push(e);
      }
    });

    parser.parseAll();

    // de_nuke.dem is a 30-round MM demo; ≥ tens of player_deaths.
    expect(playerDeaths.length).toBeGreaterThan(0);

    const sample = playerDeaths[0]!;
    expect(typeof sample.data.userid).toBe("number");
    expect(typeof sample.data.attacker).toBe("number");
    expect(typeof sample.data.weapon).toBe("string");
    expect(typeof sample.data.headshot).toBe("boolean");
  });

  it("decodes at least one weapon_fire (sanity-check second event type)", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    let weaponFireCount = 0;
    let firstWeaponFire: DecodedGameEvent | undefined;
    parser.on("gameEvent", (e: DecodedGameEvent) => {
      if (e.name === "weapon_fire") {
        weaponFireCount++;
        if (firstWeaponFire === undefined) firstWeaponFire = e;
      }
    });

    parser.parseAll();

    expect(weaponFireCount).toBeGreaterThan(0);
    expect(firstWeaponFire).toBeDefined();
    // weapon_fire descriptor: { userid: short, weapon: string, silenced: bool }
    expect(typeof firstWeaponFire!.data.userid).toBe("number");
    expect(typeof firstWeaponFire!.data.weapon).toBe("string");
  });

  it("emits 'gameEvent' AFTER 'gameEventListReady' (wire-order discipline)", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    let listReady = false;
    let firstEventBeforeList = false;
    parser.on("gameEventListReady", () => {
      listReady = true;
    });
    parser.on("gameEvent", () => {
      if (!listReady) firstEventBeforeList = true;
    });

    parser.parseAll();

    expect(firstEventBeforeList).toBe(false);
    expect(listReady).toBe(true);
  });
});
