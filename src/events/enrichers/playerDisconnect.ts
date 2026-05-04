/**
 * `player_disconnect` Tier-1 enricher (TASK-042, ADR-006).
 *
 * Wire schema (CS:GO event descriptor, verified against de_nuke.dem):
 *   { userid: short, reason: string, name: string, networkid: string }
 *
 * Resolution rules (ADR-006 decision 3 + 5):
 *   - `userid` -> `Player` via `ctx.resolvePlayer`; may be `undefined` if the
 *     CCSPlayer entity was already deleted by the time the event lands. The
 *     event still emits — a disconnect with no live overlay is meaningful
 *     (and is the common case for players who left mid-round).
 *   - `name` falls back to the `userInfoIndex` lookup when the raw event's
 *     `name` field is empty — most builds populate it, but defensive index
 *     fallback covers post-removal disconnects that arrive after the
 *     userinfo table refreshed.
 *   - Never returns `null`.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface PlayerDisconnectEvent extends EnrichedEvent {
  /** Live `Player` overlay if still present, otherwise `undefined`. */
  readonly player: Player | undefined;
  /** Wire-level userId (CS:GO event `userid`). Carried even when `player` is undefined. */
  readonly userId: number;
  /** Display name — falls back to `userInfoIndex` when raw payload omits it. */
  readonly name: string;
  /** Engine-supplied disconnect reason string (e.g. `"Kicked by Console"`). */
  readonly reason: string;
}

export const enrichPlayerDisconnect: Enricher<PlayerDisconnectEvent> = (
  raw,
  ctx,
) => {
  const userId = typeof raw.data.userid === "number" ? raw.data.userid : 0;
  const player = ctx.resolvePlayer(userId);

  const rawName = typeof raw.data.name === "string" ? raw.data.name : "";
  const fallbackName =
    rawName === "" ? ctx.userInfoIndex?.infoForUserId(userId)?.name : undefined;
  const name = rawName !== "" ? rawName : (fallbackName ?? "");

  const reason = typeof raw.data.reason === "string" ? raw.data.reason : "";

  return freezeEvent<PlayerDisconnectEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    userId,
    name,
    reason,
  });
};
