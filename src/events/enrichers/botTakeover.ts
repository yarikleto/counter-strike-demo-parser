/**
 * `bot_takeover` Tier-1 enricher (TASK-046, ADR-006).
 *
 * Wire schema (verified against de_nuke.dem descriptor table):
 *   { userid: short, botid: short, index: short }
 *
 * Fires when a human player takes control of a bot (the CSGO `bot_takeover`
 * console command, or the auto-takeover triggered when a player joins
 * mid-round). `userid` is the human player; `botid` is the bot's userid
 * being taken over. `index` is a redundant entity index that we drop —
 * the typed event surfaces only the analytical fields per TASK-046's
 * brief.
 *
 * Returns `null` when the human player cannot be resolved (mid-tick
 * disconnect or userid===0): a takeover without an actor has no
 * actionable shape.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface BotTakeoverEvent extends EnrichedEvent {
  /** Human player who took control of the bot. */
  readonly player: Player;
  /** `userid` of the bot being taken over. */
  readonly botId: number;
}

export const enrichBotTakeover: Enricher<BotTakeoverEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const botId = typeof raw.data.botid === "number" ? raw.data.botid : 0;

  return freezeEvent<BotTakeoverEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    botId,
  });
};
