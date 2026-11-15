/**
 * examples/heatmap.ts
 *
 * Export sampled player positions from a demo as CSV, suitable for plotting
 * a heatmap in your tool of choice. Uses the high-level `DemoParser.parse()`
 * one-shot API with `collectPlayerPositions: true`.
 *
 * `result.positions` is columnar (typed arrays); `positions.player[i]`
 * indexes `result.players`, which carries display names and SteamIDs.
 *
 * Run:
 *   npx tsx examples/heatmap.ts [path/to/demo.dem] > positions.csv
 *
 * Output (CSV, header first):
 *   tick,player,x,y,z
 *   64,"Adrian",-1947.0,-965.1,-416.8
 */
import { DemoParser, PositionFlags } from "../src/index.js";

const demoPath = process.argv[2] ?? "test/fixtures/de_nuke.dem";

const result = await DemoParser.parse(demoPath, {
  collectPlayerPositions: true,
  positionSampleRateTicks: 64,
});

// Columnar samples: row i of every column is one (player, tick) sample.
// Skip dead players — their origin follows their spectator camera.
const pos = result.positions!;
console.log("tick,player,x,y,z");
for (let i = 0; i < pos.length; i++) {
  if ((pos.flags[i]! & PositionFlags.Alive) === 0) continue;
  const name = result.players[pos.player[i]!]!.name;
  console.log(`${pos.tick[i]},${JSON.stringify(name)},${pos.x[i]},${pos.y[i]},${pos.z[i]}`);
}
