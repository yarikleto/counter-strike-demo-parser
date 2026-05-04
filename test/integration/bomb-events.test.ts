import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type {
  BombPlantedEvent,
  BombDefusedEvent,
  BombExplodedEvent,
  BombPickedUpEvent,
  BombDroppedEvent,
  BombBeginPlantEvent,
  BombAbortPlantEvent,
  BombBeginDefuseEvent,
  BombAbortDefuseEvent,
} from "../../src/events/index.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

// TASK-039: end-to-end smoke test for the bomb-lifecycle Tier-1 enrichers
// (plant / defuse / explode / pickup / drop, plus the begin/abort
// signaling pair) on a real 30-round MM demo.
describe("Bomb events (Tier-1) — integration on de_nuke.dem", () => {
  it("emits typed bomb-lifecycle events with resolved players", () => {
    const parser = DemoParser.fromFile(FIXTURE);

    const planted: BombPlantedEvent[] = [];
    const defused: BombDefusedEvent[] = [];
    const exploded: BombExplodedEvent[] = [];
    const pickedUp: BombPickedUpEvent[] = [];
    const dropped: BombDroppedEvent[] = [];
    const beginPlant: BombBeginPlantEvent[] = [];
    const abortPlant: BombAbortPlantEvent[] = [];
    const beginDefuse: BombBeginDefuseEvent[] = [];
    const abortDefuse: BombAbortDefuseEvent[] = [];

    parser.on("bomb_planted", (e: BombPlantedEvent) => planted.push(e));
    parser.on("bomb_defused", (e: BombDefusedEvent) => defused.push(e));
    parser.on("bomb_exploded", (e: BombExplodedEvent) => exploded.push(e));
    parser.on("bomb_pickup", (e: BombPickedUpEvent) => pickedUp.push(e));
    parser.on("bomb_dropped", (e: BombDroppedEvent) => dropped.push(e));
    parser.on("bomb_beginplant", (e: BombBeginPlantEvent) => beginPlant.push(e));
    parser.on("bomb_abortplant", (e: BombAbortPlantEvent) => abortPlant.push(e));
    parser.on("bomb_begindefuse", (e: BombBeginDefuseEvent) => beginDefuse.push(e));
    parser.on("bomb_abortdefuse", (e: BombAbortDefuseEvent) => abortDefuse.push(e));

    parser.parseAll();

    // de_nuke is a competitive bot match with active T-side bomb play, so
    // every bomb event in the lifecycle fires at least once. Empirical
    // baseline (probe): planted=19, defused=8, exploded=4, pickup=52,
    // dropped=30, beginplant=22, begindefuse=14, abortplant=0,
    // abortdefuse=0. Bots rarely abort once committed — assert non-negative
    // for those two events; assert positive floors for the rest.
    expect(planted.length).toBeGreaterThan(0);
    expect(defused.length).toBeGreaterThan(0);
    expect(exploded.length).toBeGreaterThan(0);
    expect(pickedUp.length).toBeGreaterThan(0);
    expect(dropped.length).toBeGreaterThan(0);
    expect(beginPlant.length).toBeGreaterThanOrEqual(planted.length);
    expect(beginDefuse.length).toBeGreaterThanOrEqual(defused.length);
    expect(abortPlant.length).toBeGreaterThanOrEqual(0);
    expect(abortDefuse.length).toBeGreaterThanOrEqual(0);

    console.log(
      `bomb events on de_nuke.dem: planted=${planted.length}, ` +
        `defused=${defused.length}, exploded=${exploded.length}, ` +
        `pickup=${pickedUp.length}, dropped=${dropped.length}, ` +
        `beginplant=${beginPlant.length}, begindefuse=${beginDefuse.length}, ` +
        `abortplant=${abortPlant.length}, abortdefuse=${abortDefuse.length}`,
    );

    // Sample a frozen bomb_planted and verify the typed shape.
    const plant = planted[0]!;
    expect(plant.eventName).toBe("bomb_planted");
    expect(typeof plant.eventId).toBe("number");
    expect(plant.player).toBeDefined();
    expect(typeof plant.player.slot).toBe("number");
    expect(typeof plant.site).toBe("number");
    expect(Object.isFrozen(plant)).toBe(true);

    // Sample a bomb_exploded — site is the only payload.
    if (exploded.length > 0) {
      const boom = exploded[0]!;
      expect(boom.eventName).toBe("bomb_exploded");
      expect(typeof boom.site).toBe("number");
      expect(Object.isFrozen(boom)).toBe(true);
    }
  });
});
