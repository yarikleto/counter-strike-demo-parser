/**
 * examples/economy.ts
 *
 * Round-by-round per-player economy report. Uses the high-level
 * `DemoParser.parse()` API — the economy tracker is wired in by default and
 * the per-round economy is decorated onto each `RoundPlayerStats` after the
 * parse completes (see DemoParser.parse() post-processing).
 *
 * Known limitation: `DemoResult` does NOT carry player display names — rows
 * are identified by entity slot only. For named output use the streaming API
 * (see examples/scoreboard.ts).
 *
 * Run:
 *   npx tsx examples/economy.ts [path/to/demo.dem]
 *
 * Output (one block per round):
 *   Round 1
 *     slot 2: start $800, end $0, 4 purchases
 *     slot 3: start $800, end $750, 2 purchases
 */
import { DemoParser } from "../src/index.js";

const demoPath = process.argv[2] ?? "test/fixtures/de_nuke.dem";

const result = await DemoParser.parse(demoPath);

for (const round of result.rounds) {
  console.log(`Round ${round.number}`);

  // Sort by slot for deterministic output.
  const sorted = Array.from(round.players.values()).sort(
    (a, b) => a.player.slot - b.player.slot,
  );

  for (const stats of sorted) {
    const econ = stats.economy;
    if (econ === undefined) {
      console.log(`  slot ${stats.player.slot}: (no economy snapshot)`);
      continue;
    }
    console.log(
      `  slot ${stats.player.slot}: start $${econ.startMoney}, end $${econ.endMoney}, ${econ.purchases.length} purchases`,
    );
  }
}
