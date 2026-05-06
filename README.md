# counter-strike-demo-parser

> TypeScript CS:GO `.dem` parser. Type-safe, streaming, fast.

[![CI](https://github.com/yarikleto/counter-strike-demo-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/yarikleto/counter-strike-demo-parser/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/counter-strike-demo-parser.svg)](https://www.npmjs.com/package/counter-strike-demo-parser)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-417e38)](https://nodejs.org)

Parse CS:GO `.dem` files and extract everything: every kill, every entity,
every event. Pure TypeScript, ESM-first with CJS dual export, zero native
dependencies in the default install path.

## Features

- Pure TypeScript, ESM-first with CJS dual export, no native deps required.
- Two API levels: high-level one-shot `DemoParser.parse()` async API, plus a
  streaming event-emitter for power users.
- Bit-identical to [`demoinfocs-golang`](https://github.com/markus-wa/demoinfocs-golang)
  on the cross-validated kill stream (337/337 kills match on the `de_nuke`
  fixture).
- 105 MB/s parse throughput on Apple M4 Pro / Node 22 (765 ms median for an
  80 MB demo, post-TASK-072 BitReader tuning).
- Convenience trackers: economy, damage matrix, rounds, grenades, positions,
  chat.
- Defensive parsing: malformed demos surface via the `parserError` event,
  never throw out of the parse loop.
- Goldens regression suite + Go cross-validation harness.

## Install

```bash
npm install counter-strike-demo-parser
```

Requires Node.js 22 or newer. The default install is pure TypeScript — no
toolchain, no `node-gyp`, no compile step on the consumer's machine.

## Quickstart

Parse a demo and print every kill:

```typescript
import { DemoParser } from "counter-strike-demo-parser";

const demo = await DemoParser.parse("match.dem");

for (const kill of demo.kills) {
  const tag = kill.headshot ? " (headshot)" : "";
  console.log(`${kill.attacker?.name ?? "world"} -> ${kill.victim.name} [${kill.weapon}]${tag}`);
}
```

Tally a scoreboard from the kill stream:

```typescript
import { DemoParser } from "counter-strike-demo-parser";

const demo = await DemoParser.parse("match.dem");

const board = new Map<string, { kills: number; deaths: number }>();
const bump = (name: string, key: "kills" | "deaths") => {
  const row = board.get(name) ?? { kills: 0, deaths: 0 };
  row[key] += 1;
  board.set(name, row);
};

for (const kill of demo.kills) {
  if (kill.attacker?.name) bump(kill.attacker.name, "kills");
  if (kill.victim.name) bump(kill.victim.name, "deaths");
}

for (const [name, row] of board) {
  console.log(`${name.padEnd(20)}  K:${row.kills}  D:${row.deaths}`);
}
```

## API

### High-level: `DemoParser.parse(input, options)`

For most use cases. Parses the demo end-to-end and returns a structured
`DemoResult`.

```typescript
const demo = await DemoParser.parse("match.dem");

demo.header        // map, tick rate, server info
demo.players       // PlayerSnapshot[] — players present at dem_stop
demo.kills         // PlayerDeathEvent[] — every kill in wire order
demo.rounds        // RoundSummary[] — per-round K/D/A/damage + bomb events
demo.grenades      // GrenadeThrownEvent[] — every throw
demo.chatMessages  // ChatMessage[] — in-game chat with resolved senders
demo.damageMatrix  // DamageMatrix — attacker -> victim aggregation
demo.playerPositions // optional, opt in with collectPlayerPositions: true
demo.events        // optional, opt in with includeRawEvents: true
```

`input` accepts a file path, a `Buffer`, or a Node.js `Readable`.

### Streaming: `DemoParser.fromFile()` / `DemoParser.fromBuffer()`

For per-tick control or long-running pipelines that can't afford to buffer
the whole result.

```typescript
import { DemoParser } from "counter-strike-demo-parser";

const parser = DemoParser.fromFile("match.dem");

parser.on("player_death", (e) => {
  console.log(`${e.attacker?.name ?? "world"} -> ${e.victim.name}`);
});

parser.on("round_end", (e) => {
  console.log(`Round ended, winning side: ${e.winner}`);
});

await parser.parseAll();
```

`parser.on(name, ...)` is fully type-inferred via the three-tier
`ParserEventMap`: enriched events resolve to typed payloads (`PlayerDeathEvent`,
`BombPlantedEvent`, etc.); raw game events fall back to the catch-all
`gameEvent` channel.

### Trackers

Trackers can be used standalone against the streaming parser, or accessed
through `DemoResult` for the one-shot path:

| Tracker | Surface |
|---|---|
| `EconomyTracker` | `startMoney` / `endMoney` / purchases per player per round. |
| `DamageMatrix` | Full-match and per-round attacker -> victim aggregation. |
| `RoundTracker` | Per-round summary: K/D/A, damage, bomb events, winning side. |
| `GrenadeTrajectoryTracker` | Throw -> bounces -> detonation per grenade entity. |
| `PositionTracker` | Player positions sampled at a configurable tick rate. |

## Status

`v0.1.0` — first public release. The parser has shipped the milestones it
was scoped against (M5 13/13, M6 10/10, M7 12/15) and is bit-identical to
`demoinfocs-golang` on the kill stream of the `de_nuke` fixture. The public
API surface may still evolve before `1.0`.

CS2 (Source 2) demo format is not supported — CS:GO / Source 1 only.

## Performance

Numbers from `npm run bench` on the bundled 80 MB `de_nuke` fixture, Apple M4
Pro / Node 22, 5 iterations after 2 warmup runs:

| Metric | Value |
|---|---|
| Parse duration | 765 ms median |
| Throughput | 105 MB/s |
| Peak RSS | 230 MB |

The BitReader tuning in TASK-072 cut parse time roughly in half from the
v0.0.x baseline (~1810 ms -> 765 ms median on the same fixture).

## Native addon (optional)

The repo ships an opt-in N-API native addon scaffold under `native/`. It is
**not** built or required by the default install path; a fresh
`npm install counter-strike-demo-parser` is pure TypeScript.

To build the native addon locally:

```bash
npm install
npm run build:native
```

In `v0.1.0` the addon is a toolchain-validation spike only (TASK-082) — real
acceleration via the batched native pipeline is tracked in TASK-086. Most
consumers should ignore it; the pure-TS path delivers the throughput numbers
above.

## Contributing / development

```bash
git clone https://github.com/yarikleto/counter-strike-demo-parser.git
cd counter-strike-demo-parser
npm install

npm run typecheck          # tsc --noEmit (src + test projects)
npm run lint               # eslint + prettier check
npm run test               # full unit + integration suite
npm run build              # tsup -> dist/ (CJS + ESM + .d.ts + .d.cts)
npm run bench              # benchmark harness, JSON output to bench/
npm run goldens:update     # regenerate test/golden/*.json snapshots
npm run cross-validate     # diff against demoinfocs-golang (Go required)
npm run validate:corpus    # run the parser over a directory of .dem fixtures
```

Please open an issue before starting work on anything substantial so we can
discuss the approach.

## License

[MIT](./LICENSE)
