/**
 * Golden test (TASK-077): entity-system statistics.
 *
 * Compares the live parse of `de_nuke.dem` against the committed
 * `test/golden/entities.json` snapshot. Run `npm run goldens:update`
 * to regenerate when an intentional behaviour change requires it.
 */
import { describe, it } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type { Entity } from "../../src/entities/Entity.js";
import { expectMatchesGolden } from "../golden/_compare.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = record[key]!;
  }
  return out;
}

describe("golden: entities", () => {
  it("matches the committed snapshot", () => {
    const parser = DemoParser.fromFile(FIXTURE);

    const uniqueEntityIds = new Set<number>();
    const liveEntityIds = new Set<number>();
    const perClassCounts: Record<string, number> = {};
    let maxConcurrent = 0;

    parser.on("entityCreated", (entity: Entity) => {
      uniqueEntityIds.add(entity.id);
      liveEntityIds.add(entity.id);
      if (liveEntityIds.size > maxConcurrent) {
        maxConcurrent = liveEntityIds.size;
      }
      const className = entity.serverClass.className;
      perClassCounts[className] = (perClassCounts[className] ?? 0) + 1;
    });
    parser.on("entityDeleted", (entity: Entity) => {
      liveEntityIds.delete(entity.id);
    });

    parser.parseAll();

    const actual = {
      totalUniqueEntities: uniqueEntityIds.size,
      maxConcurrent,
      perClassCounts: sortKeys(perClassCounts),
    };
    expectMatchesGolden("entities", actual);
  });
});
