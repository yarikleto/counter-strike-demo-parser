/**
 * `cs_win_panel_round` Tier-1 enricher (TASK-046, ADR-006).
 *
 * Wire schema (verified against de_nuke.dem descriptor table):
 *   { show_timer_defend: bool, show_timer_attack: bool, timer_time: short,
 *     final_event: byte, funfact_token: string, funfact_player: short,
 *     funfact_data1: long, funfact_data2: long, funfact_data3: long }
 *
 * The Tier-1 surface intentionally projects only the analytical-value
 * fields per TASK-046's brief: `final_event`, `funfact_token`, and the
 * three `funfact_data*` ints plus `funfact_player`. The `show_timer_*` /
 * `timer_time` fields are cosmetic round-end-screen UI hints with no
 * downstream value and remain available on the Tier-2 catch-all.
 *
 * Field name mapping (ADR-006 decision 6, ADR-005 overlay rules — strip
 * underscores, camelCase): `final_event` -> `finalEvent`, `funfact_token`
 * -> `funFactToken`, `funfact_player` -> `funFactPlayer`, `funfact_data1`
 * -> `funFactData1` (and `2`, `3`).
 *
 * `funfact_player` is a CSGO `userid` short. We surface it as the raw int
 * rather than resolving to a `Player` overlay because the funfact's
 * subject can be any of: an active player, a player who already
 * disconnected by the time the panel fires, or `0` for funfacts that
 * aren't player-scoped (token-only). Forcing a `Player` resolution here
 * would silently lose the disconnected-player case; the consumer who
 * needs it can route through `parser.userInfoIndex.infoForUserId`.
 *
 * `final_event` carries a small int identifying the closing event of the
 * round (variations of CT_WIN_BOMBED, T_WIN_ELIMINATION, …). No public
 * enum is locked at TASK-046 — surface the raw `number` per ADR-006
 * decision 4 forward-compat policy.
 *
 * Returns the enriched event unconditionally — every field has a safe
 * default, no userid resolution that could fail.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";

export interface CsWinPanelRoundEvent extends EnrichedEvent {
  /** Closing event of the round (small int — see CSGO source for codes). */
  readonly finalEvent: number;
  /** Localization token for the round funfact (e.g. `"#funfact_killed_half_of_enemies"`). */
  readonly funFactToken: string;
  /**
   * `userid` of the funfact's subject player, or `0` when the funfact
   * isn't player-scoped. Kept as raw int (not resolved to `Player`) to
   * preserve the disconnected-subject case.
   */
  readonly funFactPlayer: number;
  /** Funfact-specific numeric payload slot 1. */
  readonly funFactData1: number;
  /** Funfact-specific numeric payload slot 2. */
  readonly funFactData2: number;
  /** Funfact-specific numeric payload slot 3. */
  readonly funFactData3: number;
}

export const enrichCsWinPanelRound: Enricher<CsWinPanelRoundEvent> = (raw) => {
  const finalEvent =
    typeof raw.data.final_event === "number" ? raw.data.final_event : 0;
  const funFactToken =
    typeof raw.data.funfact_token === "string" ? raw.data.funfact_token : "";
  const funFactPlayer =
    typeof raw.data.funfact_player === "number" ? raw.data.funfact_player : 0;
  const funFactData1 =
    typeof raw.data.funfact_data1 === "number" ? raw.data.funfact_data1 : 0;
  const funFactData2 =
    typeof raw.data.funfact_data2 === "number" ? raw.data.funfact_data2 : 0;
  const funFactData3 =
    typeof raw.data.funfact_data3 === "number" ? raw.data.funfact_data3 : 0;

  return freezeEvent<CsWinPanelRoundEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    finalEvent,
    funFactToken,
    funFactPlayer,
    funFactData1,
    funFactData2,
    funFactData3,
  });
};
