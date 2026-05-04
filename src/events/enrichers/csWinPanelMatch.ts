/**
 * `cs_win_panel_match` Tier-1 enricher (TASK-046, ADR-006).
 *
 * Wire schema: empty (verified against de_nuke.dem descriptor table).
 *
 * Fires when the engine displays the end-of-match win panel (the scoreboard
 * shown after the last round of a competitive match). Useful as a single
 * authoritative "match ended" hook — downstream consumers should prefer
 * this over heuristics on `round_end` counts. The Tier-1 payload exposes
 * only the inherited `eventName` / `eventId`.
 *
 * Returns the enriched event unconditionally — no fields can fail to parse.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";

export type CsWinPanelMatchEvent = EnrichedEvent;

export const enrichCsWinPanelMatch: Enricher<CsWinPanelMatchEvent> = (raw) => {
  return freezeEvent<CsWinPanelMatchEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
  });
};
