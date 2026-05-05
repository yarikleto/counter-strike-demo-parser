/**
 * examples/scoreboard.ts
 *
 * Aggregate K/D/A across a whole demo from the streaming `player_death` event
 * stream and print a sorted scoreboard. Demonstrates accumulating per-slot
 * stats during the parse and resolving names ONCE at the end so disconnects
 * and reconnects don't lose attribution.
 *
 * Run:
 *   npx tsx examples/scoreboard.ts [path/to/demo.dem]
 *
 * Output (header + one row per player, sorted by kills desc):
 *   Name                K   D   A
 *   PlayerOne          24   12  3
 */
import { DemoParser } from "../src/index.js";

interface Stats {
  kills: number;
  deaths: number;
  assists: number;
}

const demoPath = process.argv[2] ?? "test/fixtures/de_nuke.dem";

const parser = DemoParser.fromFile(demoPath);

// Keyed by entity slot — stable per-round identity. We also capture each
// slot's most-recently-seen display name DURING the parse, because the
// userinfo string-table can drop disconnected players before parseAll()
// returns — resolving names only at the end loses attribution for them.
const stats = new Map<number, Stats>();
const namesBySlot = new Map<number, string>();

function captureName(slot: number): void {
  if (namesBySlot.has(slot)) return;
  const entitySlot = slot - 1;
  const userId = parser.userInfoIndex.userIdForEntitySlot(entitySlot);
  if (userId === undefined) return;
  const info = parser.userInfoIndex.infoForUserId(userId);
  if (info !== undefined) namesBySlot.set(slot, info.name);
}

function bump(slot: number, key: keyof Stats): void {
  let s = stats.get(slot);
  if (s === undefined) {
    s = { kills: 0, deaths: 0, assists: 0 };
    stats.set(slot, s);
  }
  s[key] += 1;
  captureName(slot);
}

parser.on("player_death", (e) => {
  if (e.attacker !== undefined && e.attacker.slot !== e.victim.slot) {
    bump(e.attacker.slot, "kills");
  }
  bump(e.victim.slot, "deaths");
  if (e.assister !== undefined) {
    bump(e.assister.slot, "assists");
  }
});

parser.parseAll();

const rows = Array.from(stats.entries())
  .map(([slot, s]) => ({ name: namesBySlot.get(slot) ?? `slot ${slot}`, ...s }))
  .sort((a, b) => b.kills - a.kills);

const NAME_W = Math.max(4, ...rows.map((r) => r.name.length));
const pad = (s: string, n: number): string => s + " ".repeat(Math.max(0, n - s.length));

console.log(`${pad("Name", NAME_W)}  ${pad("K", 3)} ${pad("D", 3)} ${pad("A", 3)}`);
for (const r of rows) {
  console.log(
    `${pad(r.name, NAME_W)}  ${pad(String(r.kills), 3)} ${pad(String(r.deaths), 3)} ${pad(String(r.assists), 3)}`,
  );
}
