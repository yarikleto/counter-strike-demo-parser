/**
 * `round_mvp` Tier-1 enricher (TASK-046, ADR-006).
 *
 * Wire schema (verified on de_nuke.dem descriptor table):
 *   { userid: short, reason: short, value: long, musickitmvps: long,
 *     nomusic: byte }
 *
 * The Tier-1 surface intentionally projects only `userid` -> `player` and
 * `reason` per TASK-046's brief — `value`, `musickitmvps`, `nomusic` are
 * cosmetic music-kit accounting fields that have no analytical value to
 * downstream consumers and would clutter the typed event. They remain
 * available on the Tier-2 catch-all for the rare consumer who wants them.
 *
 * `reason` is the integer MVP-award reason code (1=most kills, 2=bomb plant,
 * 3=bomb defuse on de_nuke samples). No enum is locked at TASK-046 — the
 * raw `number` surfaces, consistent with ADR-006 decision 4 forward-compat
 * policy for unknown enum values.
 *
 * Returns `null` when the awarded player cannot be resolved (mid-tick
 * disconnect or userid===0): an MVP without an awardee has no actionable
 * shape, consistent with the wave-1 `playerSpawned` / `playerGivenC4`
 * contract.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface RoundMvpEvent extends EnrichedEvent {
  /** Player awarded the MVP for the round that just ended. */
  readonly player: Player;
  /**
   * Integer MVP-award reason code. CSGO assigns small ints (e.g. 1=most
   * kills, 2=bomb plant, 3=bomb defuse) but the full enum isn't documented
   * publicly; surface the raw number per ADR-006 decision 4.
   */
  readonly reason: number;
}

export const enrichRoundMvp: Enricher<RoundMvpEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const reason = typeof raw.data.reason === "number" ? raw.data.reason : 0;

  return freezeEvent<RoundMvpEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    reason,
  });
};
