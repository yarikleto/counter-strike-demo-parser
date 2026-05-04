import { describe, expect, it } from "vitest";
import { enrichPlayerTeamChange } from "../../../../src/events/enrichers/playerTeamChange.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";
import type { Player } from "../../../../src/state/Player.js";
import { TeamSide } from "../../../../src/enums/TeamSide.js";

function makeCtx(players: Map<number, Player>): EnricherContext {
  return {
    players: [...players.values()],
    entities: undefined,
    gameRules: undefined,
    teams: [],
    userInfoIndex: undefined,
    resolvePlayer: (uid: number) => players.get(uid),
  } as unknown as EnricherContext;
}

function makeRaw(
  data: Record<string, string | number | boolean>,
): DecodedGameEvent {
  return {
    name: "player_team",
    eventId: 3,
    data: Object.freeze(data),
  };
}

describe("enrichPlayerTeamChange", () => {
  it("happy path: bot joins T from Unassigned at signon", () => {
    const player = { slot: 1 } as Player;
    const ctx = makeCtx(new Map([[123, player]]));
    const raw = makeRaw({
      userid: 123,
      team: 2,
      oldteam: 0,
      disconnect: false,
      autoteam: false,
      silent: false,
      isbot: true,
    });

    const result = enrichPlayerTeamChange(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("player_team");
    expect(result!.player).toBe(player);
    expect(result!.oldTeam).toBe(TeamSide.Unassigned);
    expect(result!.newTeam).toBe(TeamSide.T);
    expect(result!.silent).toBe(false);
    expect(result!.isBot).toBe(true);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("player undefined when overlay isn't built/already gone — still emits", () => {
    const ctx = makeCtx(new Map());
    const raw = makeRaw({
      userid: 444,
      team: 3,
      oldteam: 2,
      silent: true,
      isbot: false,
    });

    const result = enrichPlayerTeamChange(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.player).toBeUndefined();
    expect(result!.oldTeam).toBe(TeamSide.T);
    expect(result!.newTeam).toBe(TeamSide.CT);
    expect(result!.silent).toBe(true);
    expect(result!.isBot).toBe(false);
  });

  it("unknown team integer passes through as raw number (forward-compat)", () => {
    const ctx = makeCtx(new Map());
    const raw = makeRaw({
      userid: 1,
      team: 99,
      oldteam: 47,
      silent: false,
      isbot: false,
    });

    const result = enrichPlayerTeamChange(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.oldTeam).toBe(47);
    expect(result!.newTeam).toBe(99);
  });

  it("missing fields coerce to safe defaults", () => {
    const ctx = makeCtx(new Map());
    const result = enrichPlayerTeamChange(makeRaw({}), ctx);
    expect(result).not.toBeNull();
    expect(result!.player).toBeUndefined();
    expect(result!.oldTeam).toBe(TeamSide.Unassigned);
    expect(result!.newTeam).toBe(TeamSide.Unassigned);
    expect(result!.silent).toBe(false);
    expect(result!.isBot).toBe(false);
  });
});
