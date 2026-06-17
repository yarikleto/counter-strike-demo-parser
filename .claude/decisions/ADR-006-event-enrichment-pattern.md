# ADR-006: Tier-1 Event Enrichment Pattern (M4)

> Status: ACCEPTED | Author: architect | Date: 2026-04-30
> Scope: TASK-038 through TASK-046 (nine event-category tasks) plus
> TASK-047 (user-messages) and the closer TASK-048. Locks the pattern
> before nine developers fan out in parallel.

## Context

TASK-036 shipped the `EventDescriptorTable` (`src/events/EventDescriptorTable.ts`).
TASK-037 shipped the Tier-2 raw catch-all: `parser.on('gameEvent', e => …)` fires
for every CS:GO game event with `{ name, eventId, data }` where `data` is a
frozen `Record<string, string | number | boolean>` keyed by descriptor key
names (`src/events/GameEventDecoder.ts`). What TASK-037 deliberately did NOT
build is the Tier-1 surface — the ~40 enriched events (`playerDeath`,
`bombPlanted`, …) that resolve `userid` to `Player`, type integer fields as
enums, and present a frozen, ergonomic shape. Nine vertical-slice tasks build
those Tier-1 events; without a locked pattern they will land with nine subtly
different organizations, naming schemes, and missing-userid behaviors. We lock
now.

## Decision

**1. Location.** Tier-1 enrichers live in `src/events/enrichers/`, one file
per CS:GO event (e.g. `playerDeath.ts`, `bombPlanted.ts`, `weaponFire.ts`).
Per-event files scale to 40 enrichers without forcing nine developers to
serialize edits on a single shared category file, and they keep an enricher's
unit test next to it conceptually (`test/unit/events/enrichers/playerDeath.test.ts`).
A category-grouped option was rejected: parallel TASK-038/041 would constantly
collide on `combat.ts` / `grenades.ts`. Flat `src/events/PlayerDeathEnricher.ts`
was rejected: the `events/` dir already mixes the descriptor table, the
generic decoder, and `TypedEventEmitter`; a subdir keeps the Tier-1 surface
separable. Tier-1 event types co-locate with their enricher in the same file
(see decision 6); the per-file barrel is `src/events/enrichers/index.ts`.

**2. Enricher shape.** Each enricher is a pure named function with the
signature `(raw: DecodedGameEvent, ctx: EnricherContext) => TEvent | null`
where `EnricherContext` carries `{ players: PlayerLookup, gameRules: GameRules
| undefined, roundTracker: RoundTracker, entities: EntityList }`. Pure
functions, not classes — no per-event state, trivially testable, no lifecycle
to reason about. A registry pattern (`registerEnricher("player_death", fn)`)
was rejected: it adds runtime indirection for zero real flexibility (the set
of enriched events is closed; we know all 40 at TASK-048 freeze). The lookup
table (decision 5) pins each raw event name to its enricher at module load.
`PlayerLookup` is a small adapter, not the parser — see decision 3.

**3. userid → Player resolution.** CS:GO event `userid` fields are NOT entity
slot indices. They are the wire-level userId stored in the `userinfo`
string-table's `player_info_t` userdata blob — the same number a server-side
plugin would see. The current code path stops short of the resolution: the
`userinfo` table holds the raw `Uint8Array` userdata (`StringTable.ts:30`)
and no `player_info_t` decoder exists yet. The canonical resolution lives at
`src/state/userInfoIndex.ts`: a small structure built lazily on first access
that walks the `userinfo` string-table, decodes each entry's `player_info_t`
(96 bytes fixed: `version u64, xuid u64, name char[128], userId i32,
guid char[33], friendsId u32, fakeplayer u8, ishltv u8, customFiles u32[4],
filesDownloaded u8` — pull byte offsets from Source SDK's `player_info_s`)
and produces two maps: `userId -> entitySlot` and `userId -> { name, xuid,
isFakeplayer }`. The slot resolves via `parser.players` to a live `Player`
overlay. Returned shape: when `userid === 0` (world / engine-emitted) or the
userid doesn't resolve (player just disconnected mid-tick), the field on the
Tier-1 event is `undefined`, NOT a sentinel "World" Player. Reasoning:
TypeScript's `Player | undefined` forces the consumer to handle the absent
case, a sentinel does not. A separate optional `attackerName: string` field
on events like `playerDeath` carries the `userinfo`-decoded name even when
the live `Player` overlay isn't resolvable — disconnect-after-frag is the
common case here.

**4. Enum mapping.** All enums live under `src/enums/`. `HitGroup`,
`TeamSide`, `WeaponType` are already there. M4 adds `RoundEndReason` (for
`roundEnd.reason`), `DamageType` (for any future damage fields), and
`Site` (`A`/`B` numeric, for bomb events). Each enricher imports from
`src/enums/index.ts` and assigns the integer field directly when the value
matches the enum's value set. Unknown enum value handling is per-field: when
the raw integer is outside the enum's value set, surface the raw `number` on
the typed event (the Tier-1 type for that field is `HitGroup | number`,
documented in the type's JSDoc). Rejected alternative: throw on unknown
value — forward-compat servers ship new hitgroups occasionally, and a Tier-1
parse that throws on a single unknown value would be worse than the Tier-2
fallback.

**5. Wire-up.** A single `enricherTable: ReadonlyMap<string, Enricher>` lives
at `src/events/enrichers/index.ts`, populated at module load by importing each
enricher and keying it on its raw event name. `DemoParser.handleGameEvent`
(currently emits Tier-2 only — `DemoParser.ts:632`) is extended to: (a)
always emit `gameEvent` (Tier-2 unchanged), then (b) look up
`enricherTable.get(decoded.name)`, call it with the parser's context, and if
it returns non-null, emit the Tier-1 event keyed on the **raw CS:GO event
name** — `this.emit(decoded.name, result)` — NOT a camelCase translation.
Listeners subscribe via `parser.on("player_death", ...)`. Rationale: 1:1 with
the Tier-2 catch-all's `decoded.name` keeps the mental model consistent
(consumers can flip a single event name from Tier-2 to Tier-1 reception
without renaming) and avoids a translation table that would invite drift.
Tier-1 fires AFTER Tier-2 so a consumer subscribed to both observes the raw
data first — no surprise reordering. The enricher returns null ONLY when the
event is structurally unrepresentable as Tier-1 (e.g. the descriptor schema
shifted under us — defensive). Missing-userid does not return null; it sets
the Player field to undefined per decision 3 and emits anyway. Rationale: a
listener subscribed only to Tier-1 should still observe a frag where the
attacker disconnected one tick before, not silently lose it.

**6. Tier-1 type shape.** Each enricher exports two symbols: the type
(`PlayerDeathEvent`) and the function (`enrichPlayerDeath`). The type is the
event payload, frozen, all fields readonly. Naming follows the
`RoundStateChange` precedent (`src/state/RoundTracker.ts:76`) — bare PascalCase
of the camelCase event name with `Event` suffix: `PlayerDeathEvent`,
`BombPlantedEvent`, `WeaponFireEvent`. No `I` prefix (TS convention since 4.x),
no `Type` suffix. Co-located in the enricher file to keep type and producer
together — `src/events/enrichers/index.ts` re-exports both for the public
API barrel. Field naming inside the type follows ADR-005's overlay rules
(strip Hungarian, camelCase): event key `dmg_health` → `damageHealth`, event
key `attackerblind` → `attackerBlind`. Boolean derivations (`hitgroup === 1`)
become explicit fields (`isHeadshot`) only when the descriptor doesn't
already have a boolean equivalent (`headshot` from `player_death` is a real
field — keep `headshot`).

**7. Testing pattern.** Each enricher gets a vitest file at
`test/unit/events/enrichers/<name>.test.ts` covering four cases: (a) the
happy path (every key present, every userid resolves) — asserts every field
on the result; (b) attacker-userid-unresolved — asserts attacker is undefined,
victim still resolves, no throw; (c) suicide — attacker === victim — asserts
both point to the same `Player`; (d) one unknown enum value — asserts the
field surfaces as raw number, no throw. Inputs are hand-built `DecodedGameEvent`
literals plus a stub `EnricherContext`; no .dem fixture is needed at the
unit level. Each event-category task (TASK-038…046) ALSO adds one
integration assertion against `test/fixtures/de_nuke.dem` — at least one
emission of the category's flagship event (`playerDeath` for TASK-038,
`bombPlanted` for TASK-039, etc.) with a non-null `Player` reference. That's
the bar — three negative-path units plus the happy path plus one fixture
assertion. No more, no less.

**8. Performance.** The enricher fires for every game event (CS:GO emits
~10k–50k per demo on a competitive match — well below the per-tick entity
update rate of ~M+). Allocation policy: each enricher constructs exactly one
result object per call and `Object.freeze`s it (consistent with TASK-037's
`Object.freeze(data)` on the Tier-2 payload). No per-call helper allocations
inside the hot path — `EnricherContext` is built once per `parseAll()` call
and reused. The `userInfoIndex` (decision 3) is rebuilt only on
`stringTableUpdated` for the `userinfo` table, NOT on every event. The
trade-off: we accept ~one frozen object per event in exchange for immutable
public payloads. At 50k events that's 50k allocations over an entire parse —
trivial against the entity decode cost.

## Pre-mortem

What goes wrong if developers ignore this ADR? Nine enrichers land with nine
different `userid` resolution helpers (some return null, some throw, some
return a sentinel), the public API ships inconsistent on the most common
case in the entire library, and v0.1's first GitHub issue is "why does my
disconnect-frag listener never fire." Or worse: nine private re-decodings of
`player_info_t`, each subtly off by a byte, and `xuid` reads zero on flashed
disconnects but works on regular ones. Locking the resolver in
`src/state/userInfoIndex.ts` and the absent-Player contract (`undefined`,
not sentinel) is the single highest-leverage decision in this ADR.
