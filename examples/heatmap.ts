/**
 * examples/heatmap.ts
 *
 * Export sampled player positions from a demo as CSV, suitable for plotting
 * a heatmap in your tool of choice. Uses the high-level `DemoParser.parse()`
 * one-shot API with `collectPlayerPositions: true`.
 *
 * Known limitation: `DemoResult` does NOT carry player display names — rows
 * are identified by entity slot only. For named output use the streaming API
 * (see examples/scoreboard.ts) and resolve via `parser.userInfoIndex`.
 *
 * Run:
 *   npx tsx examples/heatmap.ts [path/to/demo.dem] > positions.csv
 *
 * Output (CSV, header first):
 *   tick,slot,x,y,z
 *   123,1,-1820.5,2103.7,140.0
 */
import { DemoParser } from "../src/index.js";

const demoPath = process.argv[2] ?? "test/fixtures/de_nuke.dem";

const result = await DemoParser.parse(demoPath, {
  collectPlayerPositions: true,
  positionSampleRateTicks: 64,
});

console.log("tick,slot,x,y,z");
for (const sample of result.playerPositions ?? []) {
  console.log(
    `${sample.tick},${sample.player.slot},${sample.x},${sample.y},${sample.z}`,
  );
}
