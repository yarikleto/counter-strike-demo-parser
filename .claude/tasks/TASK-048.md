# TASK-048: Public event API + TypeScript event type map (three-tier)

**Milestone:** 4 — Events
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-038 through TASK-047

**Goal:** Define the complete TypeScript event map with three tiers of type safety, providing full type inference for `parser.on('eventName', handler)`.

**Acceptance Criteria:**
- [ ] **Tier 1 — Enriched events:** `ParserEventMap` includes all events from TASK-038 through TASK-046 with full Player references, enums, and rich types. These are the events that `parser.on('playerDeath', ...)` resolves to.
- [ ] **Tier 2 — Raw typed catch-all:** `parser.on('gameEvent', (e) => ...)` fires for EVERY game event (all 169+). Payload: `{ name: string, data: Record<string, string | number | boolean> }`. Users needing rare events (Danger Zone, Gun Game, zone transitions, etc.) get them here with raw field names and values from the descriptor.
- [ ] **Tier 3 — Parser synthetic events:** `tickStart`, `tickEnd`, `entityCreated`, `entityUpdated`, `entityDeleted`, `stringTableCreated`, `stringTableUpdated`, `datatablesReady` — all typed in the map.
- [ ] `parser.on('playerDeath', (e) => ...)` correctly infers `e` as `PlayerDeathEvent`
- [ ] `parser.on('gameEvent', (e) => { if (e.name === 'enter_buyzone') ... })` provides access to any event
- [ ] Tier 1 events also fire the Tier 2 `gameEvent` with raw data (subscribe at either level)
- [ ] JSDoc on each Tier 1 event type describing when it fires and what data it carries
- [ ] Export all event types from the package entry point
- [ ] Document the three-tier system in JSDoc on ParserEventMap

**Design note:** The three-tier model means ALL 169 game events are accessible with type safety, while only the ~40 most analytically important events get bespoke enriched interfaces. Tier 1 provides Player objects instead of raw userids; Tier 2 provides raw data matching the demo's self-describing descriptors. See `.claude/research/csgo-events-complete.md` for the full event reference.

**Context (2026-04-07):** Redesigned from a flat event map to a three-tier system after reviewing the complete 169-event AlliedMods reference. This approach satisfies "all game events, fully typed" without maintaining 169 bespoke interfaces.

**Cycle:** developer (implements + tests) -> reviewer
