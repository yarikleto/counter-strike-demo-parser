# Changelog

All notable changes to `counter-strike-demo-parser` will be documented in this
file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0 caveat: minor versions may include breaking API changes while the
public surface stabilises.

## [0.1.0] — 2026-05-06 (first public release)

### Added
- `DemoParser` streaming event-emitter API with full TypeScript inference for
  `parser.on(event, handler)` (three-tier `ParserEventMap`).
- High-level `DemoParser.parse(input, options)` async API returning a
  structured `DemoResult` (header, players, kills, rounds, grenades, chat,
  damage matrix, optional positions and raw events).
- Typed game event enrichers: kills, hurts, blinds, bomb lifecycle,
  grenade lifecycle, weapons, hostages, item pickups/purchases, round
  state, match state, player connect/disconnect/team-change.
- Convenience trackers usable independently or via `DemoResult`:
  - `EconomyTracker` — startMoney / endMoney / purchases per player per round.
  - `DamageMatrix` — full-match and per-round attacker→victim damage aggregation.
  - `RoundTracker` — per-round summary with K/D/A/damage and bomb events.
  - `GrenadeTrajectoryTracker` — throw → bounce → detonation per grenade.
  - `PositionTracker` — sampled player positions at a configurable tick rate.
  - Chat message decoder with sender resolution.
- `Player` overlay with live `name` and `steamId` getters backed by the
  string-table user-info index.
- `SteamId` utility supporting Steam2/Steam3/Steam64 projections.
- Defensive parsing: malformed demos surface via the `parserError` event
  rather than throwing; the parse loop exits cleanly on first fatal error.
- Cross-validation harness against `demoinfocs-golang` — 337/337 kills match
  bit-identically on the `de_nuke` fixture.
- Golden file regression suite (header, kills, rounds, entities,
  player-end-state) with deterministic snapshot comparison.
- Benchmark harness producing a per-run JSON record (duration, peak RSS,
  throughput across N iterations).
- Optional N-API native addon scaffolding (opt-in via `npm run build:native`).

### Performance
- BitReader hot path tuned for V8: ~58% parse-time reduction on the de_nuke
  fixture (~1810 ms → 765 ms median, ~105 MB/s throughput, ~230 MB peak
  RSS on Apple M4 Pro / Node 22).

### Known limitations
- The bundled native addon is a toolchain-validation spike only; meaningful
  native acceleration via a batched native pipeline is on the roadmap, not
  in this release. Pure TypeScript is the supported install path.
- CS2 (Source 2) demo format is not supported — CS:GO/Source 1 only.
- Parsed-corpus validation has so far run on the bundled `de_nuke` fixture;
  broader corpus testing is planned post-0.1.

[0.1.0]: https://github.com/yarikleto/counter-strike-demo-parser/releases/tag/v0.1.0
