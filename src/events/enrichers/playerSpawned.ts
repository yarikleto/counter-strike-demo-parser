/**
 * `player_spawn` Tier-1 enricher (TASK-038, ADR-006).
 *
 * Wire key is `player_spawn` (Source's spelling). The Tier-1 type and
 * function follow the past-tense `PlayerSpawnedEvent` / `enrichPlayerSpawned`
 * naming so the public surface reads naturally to consumers — the enricher
 * registers under the wire key, not the function name.
 *
 * Wire schema: { userid: short, inrestart: bool }
 *
 * Resolution: `userid` -> `player`. Returns `null` if the player can't be
 * resolved — a spawn without a player target is an empty event.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface PlayerSpawnedEvent extends EnrichedEvent {
  /** Player who just (re)spawned. */
  readonly player: Player;
  /**
   * True if the spawn fired during `mp_restartgame` / warmup reset rather
   * than a normal round start. Lets analysts skip noise around restarts.
   */
  readonly inRestart: boolean;
}

export const enrichPlayerSpawned: Enricher<PlayerSpawnedEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const inRestart = raw.data.inrestart === true;

  return freezeEvent<PlayerSpawnedEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    inRestart,
  });
};
