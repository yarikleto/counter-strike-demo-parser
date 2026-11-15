# Changelog

All notable changes to `counter-strike-demo-parser` will be documented in this
file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0 caveat: minor versions may include breaking API changes while the
public surface stabilises.

## [0.4.0] — 2026-11-15

### Added
- `ParseOptions.collectVoice` (default `false`) and `DemoResult.voice`:
  every `CSVCMsg_VoiceData` message as typed-array columns — tick, speaker
  (`player`, a roster index, or `NO_PLAYER`), `format`, `flags`
  (`VoiceFlags.Proximity` / `Caster`), `sectionNumber`, `sequenceBytes`,
  `sampleOffset` (the speaker's sample clock), `offset` / `size` — plus all
  payloads concatenated in one `Uint8Array`. The codec from `svc_VoiceInit`
  (`codec`, `quality`, `version`) and its frame geometry (`sampleRate`,
  `frameSamples`, `frameBytes`: 22050 / 512 / 64 for `vaudio_celt`) come
  with it. Nothing is decoded; the README documents the frame layout for a
  decoder.
- `voiceBuffers()` (transfer list) and `voiceFrame(voice, i)` (row payload),
  `VoiceFlags`, `VoiceFormat` and the `PlayerVoice` type.
- Streaming `voiceInit` event (`codec`, `quality`, `version`), decoded from
  `svc_VoiceInit`.
- The `voiceData` event now also carries `client`, `xuid`, `caster`,
  `audibleMask`, `sequenceBytes`, `sectionNumber` and
  `uncompressedSampleOffset`.
- `npm run validate:corpus -- <dir> --voice` reports voice messages, bytes,
  speakers, formats, frame sizes, frames per second and lost frames;
  `npm run bench -- --collect-voice` benchmarks with voice on.

Speakers resolve by client slot when the slot's userinfo has the message's
SteamID, and by SteamID otherwise, so reconnecting players keep their roster
index. On six real 74–149 MB matches voice is 36–70k messages and 2.7–5.4 MB
of payload from 10–20 speakers, all `vaudio_celt`, with every speaker
resolved.

### Changed
- `svc_VoiceInit` (command 14) is now decoded, so it no longer reaches the
  `unknownMessage` event.
- With `collectVoice`, players who only spoke (for example spectators) are
  added to `DemoResult.players`, which can shift later roster indices.
- The `voiceData` handler does no work when nothing listens to it.

### Performance
- `npm run bench` (Apple M5, Node 26, 10 runs, median): the default parse is
  unchanged (80 MB `de_nuke` fixture 606 → 606 ms; 74 MB club `de_nuke`
  532 → 534 ms). With `collectVoice`: 608 ms (+0.3 %, 25k messages) and
  549 ms (+2.9 %, 41k messages, 3 MB).

## [0.3.0] — 2026-11-15

### Added
- `DemoResult.shots`: one row per `weapon_fire` event as typed-array
  columns, like `positions`: tick, shooter (`player`, a roster index),
  shooter origin, yaw/pitch, weapon (index into `shots.weapons`, named like
  `KillRecord.weapon`), `kind` (`ShotKind.Bullet` / `Knife` / `Grenade` /
  `Other`: knife swings and grenade throws are kept and marked) and
  `flags` (`ShotFlags.Silenced`).
- `DemoResult.hits`: one row per `player_hurt` event as typed-array
  columns: tick, attacker (`NO_PLAYER` for world damage), victim, weapon,
  damage, armor damage, hit group, health and armor left, attacker origin
  (`NaN` without an attacker) and victim origin.
- `shotBuffers()` / `hitBuffers()` return the `postMessage` transfer lists,
  like `positionBuffers()`; `shotKind()` classifies a weapon name.
- `DecodedGameEvent.tick`: the frame tick the event was decoded at, so raw
  events (`includeRawEvents`) can be ordered in time. `decodeGameEvent()`
  takes it as an optional third argument (default 0).

Shots and hits are always collected: on six real 74–149 MB matches they
hold 3.8–10k shots and 0.9–1.7k hits in 150–360 KB of columns (about 3 MB
as objects), and parse time is unchanged. On those demos 99.9 % or more of
gun hits share their tick with a shot by the same attacker.

### Changed
- Code that builds `DecodedGameEvent` objects by hand (for example to test
  an enricher) must now set `tick`. Events emitted by the parser always
  carry it.

### Performance
- `npm run bench` (80 MB `de_nuke` fixture, `--expose-gc`, Apple M5,
  Node 26): 628 → 632 ms median, within noise.

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
- `DemoResult.score` (final scoreboard from the team entities) and
  `rounds[i].score` (scoreboard after each round, following the halftime
  side swap).
- `rounds[i].voided`: rounds played before a later `begin_new_match`
  (match restart) are kept but marked, since the engine resets the
  scoreboard.
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
- `DamageMatrix` and `EconomyTracker` counted rounds by `round_start`, so on
  demos that start at `begin_new_match` every per-round bucket was off by
  one. They now share the round boundaries of `DemoResult.rounds`.

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
