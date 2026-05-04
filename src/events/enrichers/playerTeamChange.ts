/**
 * `player_team` Tier-1 enricher (TASK-042, ADR-006).
 *
 * Wire schema (CS:GO event descriptor, verified against de_nuke.dem):
 *   { userid: short, team: byte, oldteam: byte, disconnect: bool,
 *     autoteam: bool, silent: bool, isbot: bool }
 *
 * Resolution rules (ADR-006 decisions 3, 4, 5):
 *   - `userid` -> `Player | undefined`. The event still emits when the
 *     overlay isn't (yet) built — the team-change is meaningful even for
 *     a player whose CCSPlayer entity hasn't landed.
 *   - `team`/`oldteam` map to `TeamSide` when the raw integer is in the
 *     enum's value set; unknown integers pass through as raw `number`
 *     (forward-compat with future server builds, ADR-006 decision 4).
 *   - Never returns `null`.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";
import { TeamSide } from "../../enums/TeamSide.js";

const KNOWN_TEAMS = new Set<number>(Object.values(TeamSide));

export interface PlayerTeamChangeEvent extends EnrichedEvent {
  /** Live `Player` overlay if resolvable, otherwise `undefined`. */
  readonly player: Player | undefined;
  /**
   * Previous team side. {@link TeamSide} when the wire integer matches the
   * enum's value set; raw `number` for forward-compat.
   */
  readonly oldTeam: TeamSide | number;
  /**
   * New team side. {@link TeamSide} when the wire integer matches the enum's
   * value set; raw `number` for forward-compat.
   */
  readonly newTeam: TeamSide | number;
  /** True when the team change was a silent move (no in-game announcement). */
  readonly silent: boolean;
  /** True when the user is a bot (CS:GO `isbot` flag). */
  readonly isBot: boolean;
}

export const enrichPlayerTeamChange: Enricher<PlayerTeamChangeEvent> = (
  raw,
  ctx,
) => {
  const userId = typeof raw.data.userid === "number" ? raw.data.userid : 0;
  const player = ctx.resolvePlayer(userId);

  const newTeamRaw = typeof raw.data.team === "number" ? raw.data.team : 0;
  const oldTeamRaw =
    typeof raw.data.oldteam === "number" ? raw.data.oldteam : 0;

  const newTeam: TeamSide | number = KNOWN_TEAMS.has(newTeamRaw)
    ? (newTeamRaw as TeamSide)
    : newTeamRaw;
  const oldTeam: TeamSide | number = KNOWN_TEAMS.has(oldTeamRaw)
    ? (oldTeamRaw as TeamSide)
    : oldTeamRaw;

  const silent = raw.data.silent === true;
  const isBot = raw.data.isbot === true;

  return freezeEvent<PlayerTeamChangeEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    oldTeam,
    newTeam,
    silent,
    isBot,
  });
};
