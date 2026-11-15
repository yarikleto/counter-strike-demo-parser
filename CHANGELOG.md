# Changelog

All notable changes to `counter-strike-demo-parser` will be documented in this
file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0 caveat: minor versions may include breaking API changes while the
public surface stabilises.

## [0.2.0] — 2026-11-15

### Added
- Browser support. A browser build with no Node built-ins (`Uint8Array` /
  `ArrayBuffer` input) is selected by the `browser` export condition, or
  explicitly via `counter-strike-demo-parser/browser`; the Node build
  (`node` condition, `counter-strike-demo-parser/node`) adds file paths,
  streams and the native addon loader. Verified in a Web Worker in Chrome
  (`npm run test:browser`).
- `parseDemo(input, options)`, a functional form of `DemoParser.parse()`.
- Progress and cancellation: `onProgress`, `signal` and `yieldIntervalMs`
  options, and `parser.parseAllAsync()`, which parses in time slices and
  yields to the event loop in between.
- `DemoResult.positions`: columnar typed arrays (tick, player, slot, x/y/z,
  yaw/pitch, health, armor, money, team, alive/helmet/defuser flags, active
  weapon) sampled after each frame is applied. `positionBuffers()` returns
  the transfer list for a zero-copy `postMessage`.
- `DemoResult.grenades` derived from projectile entities (thrower, type,
  tick, thrower and projectile positions). GOTV demos never network
  `grenade_thrown`, so the old event-based list was always empty.
- `DemoResult.grenadeEffects` (smoke and inferno start/end, flash/HE/decoy
  detonations), `DemoResult.bomb` (every bomb step with position and site
  A/B), `DemoResult.hostageEvents`, `DemoResult.tickRate`, per-round
  economy and `freezeEndTick`.
- `DemoResult.players`: a roster of everyone seen, including players who
  left; `PlayerRef.index` and `positions.player` point into it.
- `Player.armor`, `Player.hasHelmet`, `Player.hasDefuser`,
  `weaponNameForItemDefIndex()`, `readEntityOrigin()`, and the `frameEnd`
  parser event.

### Changed (breaking)
- `DemoResult` is plain data: no class instances and no references into the
  parser, so it can be `postMessage`d, stored in IndexedDB or serialized.
  Players are `PlayerRef`s captured at event time instead of live `Player`
  overlays.
- `DemoResult.players` is the roster (`PlayerInfo[]`) instead of snapshots at
  `dem_stop`; `kills` are `KillRecord`s with attacker and victim positions;
  `damageMatrix` is replaced by `damage` (`DamageRecord[]`);
  `playerPositions` is replaced by the columnar `positions`;
  `rounds[i].players` is an array and carries `economy`; `moneySpent` is
  removed; `rounds[i].bombEvents` holds `BombRecord`s;
  `grenades` holds `GrenadeThrow`s.
- `GrenadeTrajectory.thrower` is a `PlayerRef`, and trajectories gain
  `throwerPosition`.
- `DemoParser` and `TypedEventEmitter` no longer extend Node's
  `EventEmitter`; the typed `on`/`off`/`once`/`emit`/`removeAllListeners`/
  `listenerCount` surface is unchanged.
- `RoundEndReason` values now follow Valve's table: 12 is `TargetSaved`,
  11 `HostagesRescued`, 16 `GameStart`; the remaining reasons are added.
- `PositionTracker` is removed (superseded by `DemoResult.positions`).

### Fixed
- The ESM build failed to load (`ERR_MODULE_NOT_FOUND` for
  `protobufjs/minimal`); both ESM and CJS builds now load in Node and
  bundlers.
- Grenade trajectory points were cell-relative offsets such as (11, 4, 6);
  they are now world coordinates (`m_cellX/Y/Z` combined with `m_vecOrigin`,
  as in demoinfocs).
- A live round whose `round_start` predates the recording (GOTV started at
  `begin_new_match`) was dropped from `rounds`; a round with a `round_end`
  is never dropped now.
- Round MVPs were never attached: `round_mvp` fires just before `round_end`.
  MVP names were also read after the parse from slots later reused by bots.
- String tables kept a 31-entry history instead of 32, garbling prefix
  compressed entries such as most `modelprecache` paths.
- Position samples could mix two ticks (sampled on the first entity update
  of a frame).

### Performance
- Node parse speed is unchanged (`npm run bench`: 661 → 666 ms mean,
  within noise); memory with positions on a 156 MB demo sampled every 8
  ticks drops from 772 MB to 448 MB peak RSS.

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
