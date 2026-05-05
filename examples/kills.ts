/**
 * examples/kills.ts
 *
 * Print every `player_death` event in a CS:GO demo as it streams off the wire.
 * Demonstrates the streaming event API and the `userInfoIndex` name-resolution
 * pattern (Player.slot -> entitySlot -> userId -> UserInfo.name).
 *
 * Run:
 *   node --experimental-strip-types examples/kills.ts [path/to/demo.dem]
 *
 * Output: one line per kill —
 *   <tick> <attacker> [<weapon>] -> <victim> [HS] [WB] [NS]
 * Tags: HS=headshot, WB=wallbang/penetration, NS=no-scope. World damage
 * (no attacker) is printed as `world`.
 */
import { DemoParser, type Player } from "../src/index.js";

const demoPath = process.argv[2] ?? "test/fixtures/de_nuke.dem";

const parser = DemoParser.fromFile(demoPath);

function nameOf(player: Player | undefined): string {
  if (player === undefined) return "world";
  const entitySlot = player.slot - 1;
  const userId = parser.userInfoIndex.userIdForEntitySlot(entitySlot);
  if (userId === undefined) return `slot ${player.slot}`;
  const info = parser.userInfoIndex.infoForUserId(userId);
  return info?.name ?? `slot ${player.slot}`;
}

parser.on("player_death", (e) => {
  const tags: string[] = [];
  if (e.headshot) tags.push("HS");
  if (e.penetrated) tags.push("WB");
  if (e.noscope) tags.push("NS");
  const tagStr = tags.length === 0 ? "" : ` ${tags.map((t) => `[${t}]`).join(" ")}`;
  const weapon = e.weapon === "" ? "world" : e.weapon;
  console.log(
    `${parser.currentTick} ${nameOf(e.attacker)} [${weapon}] -> ${nameOf(e.victim)}${tagStr}`,
  );
});

parser.parseAll();
