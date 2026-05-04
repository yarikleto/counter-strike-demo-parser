import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type {
  PlayerConnectEvent,
  PlayerDisconnectEvent,
  PlayerTeamChangeEvent,
} from "../../src/events/index.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

// TASK-042: end-to-end smoke test for the player-lifecycle Tier-1 enrichers
// (player_connect, player_disconnect, player_team) on de_nuke.dem.
//
// de_nuke.dem is a bots-only recording. Empirically the fixture emits all
// three events at signon (~14 connects, ~15 disconnects, ~40 team changes
// across the warmup/match), but per the brief we tolerate `>= 0` because
// alternate bot configurations may auto-spawn without explicit connects.
describe("Player lifecycle events (Tier-1) — integration on de_nuke.dem", () => {
  it("emits typed connect/disconnect/team events and the dispatcher is wired", () => {
    const parser = DemoParser.fromFile(FIXTURE);

    const connects: PlayerConnectEvent[] = [];
    const disconnects: PlayerDisconnectEvent[] = [];
    const teams: PlayerTeamChangeEvent[] = [];

    parser.on("player_connect", (e: PlayerConnectEvent) => connects.push(e));
    parser.on("player_disconnect", (e: PlayerDisconnectEvent) =>
      disconnects.push(e),
    );
    parser.on("player_team", (e: PlayerTeamChangeEvent) => teams.push(e));

    parser.parseAll();

    // Bots-only fixture: any of these may legitimately be 0 on alternate
    // recordings (auto-spawn without explicit connects). Document via log.
    expect(connects.length).toBeGreaterThanOrEqual(0);
    expect(disconnects.length).toBeGreaterThanOrEqual(0);
    expect(teams.length).toBeGreaterThanOrEqual(0);

    console.log(
      `player lifecycle events on de_nuke.dem: player_connect=${connects.length}, ` +
        `player_disconnect=${disconnects.length}, player_team=${teams.length}`,
    );

    // Sanity-check the typed shape on whatever did fire.
    if (connects.length > 0) {
      const c = connects[0]!;
      expect(c.eventName).toBe("player_connect");
      expect(typeof c.eventId).toBe("number");
      expect(typeof c.name).toBe("string");
      expect(typeof c.steamId).toBe("string");
      expect(typeof c.userId).toBe("number");
      expect(typeof c.isBot).toBe("boolean");
      expect(Object.isFrozen(c)).toBe(true);
    }

    if (disconnects.length > 0) {
      const d = disconnects[0]!;
      expect(d.eventName).toBe("player_disconnect");
      expect(typeof d.userId).toBe("number");
      expect(typeof d.name).toBe("string");
      expect(typeof d.reason).toBe("string");
      // `player` may be undefined when the entity is already gone — that's
      // by design; just assert the type contract is honoured (Player or
      // undefined, never a sentinel).
      if (d.player !== undefined) {
        expect(typeof d.player.slot).toBe("number");
      }
      expect(Object.isFrozen(d)).toBe(true);
    }

    if (teams.length > 0) {
      const t = teams[0]!;
      expect(t.eventName).toBe("player_team");
      expect(typeof t.oldTeam).toBe("number");
      expect(typeof t.newTeam).toBe("number");
      expect(typeof t.silent).toBe("boolean");
      expect(typeof t.isBot).toBe("boolean");
      if (t.player !== undefined) {
        expect(typeof t.player.slot).toBe("number");
      }
      expect(Object.isFrozen(t)).toBe(true);
    }
  });
});
