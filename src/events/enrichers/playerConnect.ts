/**
 * `player_connect` Tier-1 enricher (TASK-042, ADR-006).
 *
 * Wire schema (CS:GO event descriptor, verified against de_nuke.dem):
 *   { name: string, index: byte, userid: short, networkid: string,
 *     address: string }
 *
 * Some Source builds also ship an explicit `bot: bool` cell; the descriptor
 * loaded from the demo's `CSVCMsg_GameEventList` is canonical, so we read
 * defensively — if `bot` isn't present we fall back to the convention that
 * `networkid === "BOT"` flags a bot.
 *
 * Resolution rules:
 *   - `player_connect` fires BEFORE the CCSPlayer entity is created, so
 *     `ctx.resolvePlayer(userid)` returns `undefined`. We therefore expose
 *     `userId: number` (the wire userId) rather than a `Player` reference —
 *     downstream consumers correlate via the userId once the entity arrives.
 *   - Never returns `null`; a connect event always carries meaningful
 *     identity (name + steamId + userId) even when the parser hasn't yet
 *     seen the player's entity.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";

export interface PlayerConnectEvent extends EnrichedEvent {
  /** Display name announced at connect time. */
  readonly name: string;
  /**
   * The connecting user's network identity — `"STEAM_x:y:z"` for humans,
   * `"BOT"` for bots. CS:GO calls this field `networkid` on the wire; we
   * surface it as `steamId` to match the public-API name in TASK-042.
   */
  readonly steamId: string;
  /** Wire-level userId (CS:GO event `userid`). */
  readonly userId: number;
  /** True when the connecting user is a bot (`networkid === "BOT"` or explicit `bot` flag). */
  readonly isBot: boolean;
}

export const enrichPlayerConnect: Enricher<PlayerConnectEvent> = (raw) => {
  const name = typeof raw.data.name === "string" ? raw.data.name : "";
  const steamId =
    typeof raw.data.networkid === "string" ? raw.data.networkid : "";
  const userId = typeof raw.data.userid === "number" ? raw.data.userid : 0;
  const explicitBot = raw.data.bot === true;
  const isBot = explicitBot || steamId === "BOT";

  return freezeEvent<PlayerConnectEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    name,
    steamId,
    userId,
    isBot,
  });
};
