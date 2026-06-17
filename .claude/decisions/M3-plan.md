# M3 Plan: Typed State Overlay (TASK-028 — TASK-035)

> Author: architect | 2026-04-29 | Status: PROPOSED

## Charter

M3 turns "raw entity properties indexed by `flatPropIdx`" into "typed
accessors that look like a CS:GO data model." When M3 ships, a consumer
who knows nothing about SendTables, flat-prop arrays, ServerClass IDs, or
priority-140 buckets can write `parser.players[0].position` and receive
a `{ x, y, z }` vector; can write `parser.teams.ct.score` and receive a
number; can write `parser.gameRules.isBombPlanted` and receive a boolean.
M3 is the first milestone that produces a public surface a non-parser-
author would willingly use. It does not parse anything new from the wire
— every value M3 returns is already in the M2 entity store. M3 is purely
a read-side typed projection. That is the whole point: M3 is small,
boring, and library-shaping. Get the names right and the API survives
ten years; get them wrong and we live with the regret because consumers
will be importing them. The work is risk-light on the byte level (M2
owns all that) and risk-heavy on the API-design level. Nothing here
should add a microsecond of decode time or a megabyte of memory.

## Subsystem Breakdown

The eight tasks decompose into four subsystems with one cross-cutting
utility. Boundaries are deliberate: each overlay class talks only to the
M2 `Entity`'s `propByName` (or a precomputed flat-prop index) and the
shared handle resolver — never directly to `EntityStore` and never to
the wire protocol.

**1. Entity-handle resolution (TASK-032).** A pure utility module —
`handleToIndex(h)`, `handleToSerial(h)`, `isValidHandle(h)`,
`resolveHandle(entityList, h)`. Source's 32-bit entity handle packs an
11-bit entity index (0..2047) with a serial number in the upper bits;
sentinel `INVALID_HANDLE === (1 << 32) - 1` means "no entity." The flat-
prop dump confirms the wire encoding: `m_hMyWeapons.NNN` and
`m_hActiveWeapon` are stored with `nBits=21, UNSIGNED|NOSCALE` (rows
217–280 and row 1223 of CCSPlayer) — 21 bits = 11 index + 10 serial,
not the full 32-bit form. The resolver must accept both forms (raw 32-
bit handle from C++ wire data, packed 21-bit handle from a SendProp) and
return either an `Entity` or `undefined`. This is the foundational
subsystem because every other overlay that links to another entity
(weapons-to-owner, players-to-active-weapon, players-to-team) goes
through it.

**2. Player-centric overlays (TASK-028, TASK-029, TASK-031).** The
`Player` class wraps a CCSPlayer entity and surfaces typed getters; the
`PlayerResource` overlay wraps the singleton `CCSPlayerResource` entity
and surfaces per-slot stat arrays; the `Weapon` class wraps any
`CWeapon*` entity and resolves its owner. These three are tightly
coupled because `Player` exposes `.weapons` (which returns `Weapon[]`)
and `Weapon` exposes `.owner` (which returns a `Player`), and stats on
`Player` may be sourced from either the player entity (`m_iAccount`,
`m_iHealth`) or the resource entity (`m_iKills.NNN` for the player's
slot index). The shared join key is the player's slot/index — see the
`m_iTeamNum` row at flat-prop index 1175 of CCSPlayer (Int, nBits=6),
which is the entity's team membership, while the spectator/CT/T entity
exists separately as a CCSTeam.

**3. Match-centric overlays (TASK-030, TASK-033, TASK-034).** `Team`
wraps each CCSTeam entity (only 16 flat props per CCSTeam — small,
rows visible in golden dump from index 0 onward; `m_iTeamNum` at index
0, `m_szTeamname` at index 7 String). `GameRules` wraps the singleton
CCSGameRulesProxy (1126 props but only ~15 we expose — `m_bFreezePeriod`
at 1056, `m_iRoundTime` at 1068, `m_gamePhase` at 1069,
`m_totalRoundsPlayed` at 1070, `m_bBombPlanted` at 1094,
`m_iRoundWinStatus` at 1095). `RoundState` is a small state-machine on
top of `GameRules` that emits `roundStateChanged` events when
`m_gamePhase` and `m_bFreezePeriod` transition. These three tasks share
no state with player overlays except via team-side enum mapping
(2=Spectator, 3=T, 4=CT in Source convention).

**4. ServerInfo overlay (TASK-035).** The smallest task. M1 already
parses both the demo header and the `CSVCMsg_ServerInfo` packet and
exposes them via `parser.serverInfo` (currently the raw decoded message,
not a typed roll-up). TASK-035 promotes that property to a typed
`ServerInfo` interface that joins header fields (mapName, playbackTime,
isGOTV) with packet fields (tickInterval, maxClasses), and adds computed
accessors (`tickRate = 1/tickInterval`).

## Vertical Slice Ordering

M3 ships in three slices. Each ends with a runnable, observable
capability on `de_nuke.dem`. The ordering is dictated by dependency, not
size — handle resolution must land first because three of the seven
remaining tasks call into it.

**Slice 1 — Foundations.** TASK-032 (entity handle utility) and
TASK-035 (ServerInfo typed overlay). Both are small, both are
demonstrably correct without an M2 entity store. End-state on de_nuke:
running the existing parser and reading `parser.serverInfo` returns a
`ServerInfo` object with `{ mapName: "de_nuke", tickRate: 64, isGOTV:
true|false, ...}`; calling `handleToIndex(0x1FFFFF)` returns the index
component, `isValidHandle(INVALID_HANDLE)` returns false. These two
tasks unblock the other six and ship a real public-API improvement
immediately. Ordering within the slice: parallel — they share zero
files. **A two-developer team can finish Slice 1 in one work session.**

**Slice 2 — Player surface.** TASK-028 (Player), TASK-029
(PlayerResource), TASK-031 (Weapon). End-state on de_nuke: streaming the
demo to the first post-freeze tick of round 1, `parser.players` returns
a length-N array of `Player` objects (where N is the number of
connected players, ≤10 for de_nuke); `players[0].name` returns a string,
`players[0].position` returns `{ x, y, z }`, `players[0].team` returns
`'CT' | 'T' | 'SPECTATOR'`, `players[0].activeWeapon` returns a
`Weapon` instance whose `.owner === players[0]`, `players[0].kills`
returns a non-negative integer (sourced via `PlayerResource`).
**Note on validation:** TASK-018a (priority-140 within-bucket order)
and TASK-021a (decoder bit-for-bit divergence vs demoinfocs) are still
in progress as of 2026-04-29. The Player overlay's *shape* — that a
`name` getter returns a string and a `position` getter returns a
Vector3 — does not depend on those tasks. The *correctness* of returned
values for any prop in the priority-140 bucket (`m_iMatchStats_*`) does.
Slice 2 ships the shape; correctness assertions for stat fields move to
integration tests gated `.skip` until 018a/021a close. The shape itself
is a first-class deliverable: it lets us write the M4 event system
against typed `Player` objects in parallel. Ordering within the slice:
**TASK-028 first, then TASK-031 and TASK-029 in parallel.** TASK-028
defines the `Player` interface that 029 and 031 reference (029 sets
stats fields *on* Player, 031's `.owner` returns a Player). Once
TASK-028's interface is merged, the other two are independent.

**Slice 3 — Match surface.** TASK-030 (Team), TASK-033 (GameRules),
TASK-034 (RoundState). End-state on de_nuke: at the first post-freeze
tick, `parser.teams.ct.players` returns an array of CT-side `Player`
references; `parser.gameRules.roundNumber` returns 1;
`parser.gameRules.isFreezePeriod` returns true at the relevant ticks
and false at others; the parser emits `roundStateChanged` events as
the demo progresses with `{ from: 'freeze', to: 'live' }` and similar
transitions. Ordering within the slice: TASK-030 and TASK-033 in
parallel (disjoint subsystems, both depend only on TASK-026 + TASK-032);
TASK-034 serializes after TASK-033 because it observes `gameRules`
property changes.

## Parallelism Map

End-to-end critical path is **TASK-032 → TASK-028 → TASK-033 →
TASK-034** (4 tasks). Everything else fans out:

- Slice 1 internal: TASK-032 ‖ TASK-035 (2 parallel tracks).
- Slice 2 internal: TASK-028 first, then TASK-029 ‖ TASK-031 (2 parallel
  tracks after the first).
- Slice 3 internal: TASK-030 ‖ TASK-033, then TASK-034 (2 parallel
  tracks then serialize).
- **Across slices:** the parallelism is limited because Slice 2 and
  Slice 3 both reference TASK-032's handle resolver; once Slice 1's
  TASK-032 lands, Slices 2 and 3 can in principle proceed in parallel
  on a two-developer team. We do not recommend it: the API-design
  decisions in Player (Slice 2) cascade into how Team exposes
  `.players` (Slice 3), and resolving them serially keeps the public
  surface coherent. **Lean serial-across-slices, parallel-within-slice.**

A two-developer team finishes M3 in roughly 60–70% of single-developer
wall-clock time. Most of the speedup is in Slice 2 + Slice 3 parallel
sub-task pairs, not from running entire slices concurrently.

## Public API Surface

**Decision: flat namespace on the parser.** The public shape is:

```ts
parser.players: ReadonlyArray<Player>;     // length = connected players
parser.teams: { ct: Team; t: Team; spectator: Team; unassigned: Team };
parser.gameRules: GameRules | undefined;   // undefined before signon
parser.serverInfo: ServerInfo | undefined; // undefined before header+packet
parser.roundState: RoundState;             // always present (defaults to 'pregame')
```

Rejected alternative: a `parser.state.{players, teams, ...}` namespace.
Reasoning: `parser.serverInfo` already exists as a top-level field in M1;
introducing a `state` namespace now would either move that (breaking
change) or split the surface (incoherent). Top-level wins.

**Decision: live views, not snapshots.** Every overlay re-reads from
the underlying entity on every property access. `Player.position`
internally calls `entity.propByName('cslocaldata.m_vecOrigin')` (or a
cached flat-prop-index variant — see landmine #2 below) every time.
Reasoning: this matches ADR-002 amendment's lazy-Entity-view decision
and the existing `propByName` cache in `src/entities/Entity.ts:107-126`.
A snapshot model would need invalidation on every `entityUpdated` event
across every held overlay — exactly the hidden-allocation hot path
ADR-002 fought to avoid. Live views are also what consumers actually
want: `for (const p of parser.players) console.log(p.position)` inside
an `entityUpdated` handler should print the *just-updated* position.

**Decision: missing entities return `undefined`, not throw.** When the
GameRulesProxy entity hasn't been created yet (early ticks before
signon), `parser.gameRules` returns `undefined`. When a player has
disconnected, they are not present in `parser.players` at all
(filtered out by checking entity `state !== 'free'`). When a Weapon's
owner handle resolves to a freed slot, `weapon.owner` returns
`undefined`. Reasoning: throwing on early reads is hostile in a
streaming parser where consumers register listeners before parsing
starts. `undefined` is annoying but safe; the typed return signature
forces the caller to handle the case. Throw is reserved for truly
exceptional states (StaleEntityError on a held overlay past delete is
a separate concern, inherited from M2).

**Decision: overlays are NOT cached on the parser.** Each access of
`parser.players` re-walks the entity list and constructs fresh
`Player` instances. The `Player` instance itself is small (one
reference to the underlying `Entity`, one cached prop-index map shared
across instances per ServerClass). Per-tick allocation cost is bounded
by 10 Player objects + 1 GameRules + 4 Teams = 15 object allocations
per access. If profiling in M7 shows this hurts, we cache
the array and invalidate on entity create/delete events. Type 2
decision; document the perf characteristic; revisit if measured.

**These four decisions are individually small but collectively shape
the entire M3 surface. They warrant a short ADR — see
`ADR-004-overlay-staleness.md` (filed alongside this plan).**

## Highest-Risk Landmines

Six things are easy to get wrong, hard to detect, and embarrassing to
discover after consumers depend on them.

**1. Validation gap: M2 byte correctness is not yet locked.** TASK-018a
and TASK-021a are open as of this plan. M3 reads from M2's entity
store; if 018a finds that priority-140 within-bucket order is wrong,
every `Player.kills`, `Player.deaths`, `Player.matchStats` (anything in
the m_iMatchStats_* expansion at indices 1355–1744) returns the wrong
value. If 021a finds float-quantization divergence, every
`Player.position` returns values that are correct-modulo-Source-spec
but disagree with demoinfocs's golden output by ≤0.000001 units.
**Mitigation:** M3 unit tests pin overlay shape (`typeof
player.position === 'object' && 'x' in player.position`), not values.
Integration tests assert values for non-controversial props
(`m_iAccount` at index 1273, `m_iHealth` at 1230, `m_iTeamNum` at 1175
— all priority-128 Ints decoded by paths that 021a does not implicate).
Stat-field assertions go in a `.skip`-gated test that 018a will flip on
when it lands. **Acknowledge the gap; don't pretend it isn't there;
ship the structure.**

**2. flatPropIdx-by-name lookup is the hot path.** `Entity.propByName`
already caches the name→index map per ServerClass on first call (see
`src/entities/Entity.ts:107-126`). Good — but each Player overlay
getter that calls `propByName('m_iHealth')` still does a Map.get + a
typed-array read per access. With 10 Players, 10 getters per Player,
and an `entityUpdated` event per tick at 64 ticks/sec for an hour-long
demo, that's ~2.3M Map.get calls. Map.get is O(1) but not free.
**Mitigation:** `Player` precomputes the integer flat-prop indices once
on construction (single pass, ~10 prop names) and stores them as
class-private numbers. Subsequent reads call `entity.prop(idx)` (a
typed-array dereference) instead of `entity.propByName(name)`. The
existing per-ServerClass name cache backs the precompute. The
overlay-private index-cache is a Type 2 implementation detail; document
it lightly so the next architect doesn't accidentally remove it
thinking it's redundant.

**3. PlayerResource is a separate entity. Joining by slot index is the
trap.** TASK-029's spec says CCSPlayerResource exposes per-player stat
arrays as `m_iKills.000`, `m_iKills.001`, etc. The join key is the
player's *entity slot index* — but the player's slot is the wire entity
ID (0..2047), and the resource arrays are typically only 64 long
(MAX_PLAYERS). Mapping an entity ID 7 to a resource index 7 is correct
*if and only if* the player's userinfo slot equals their entity index,
which is **only true after signon** and may not survive disconnects.
**Mitigation:** the canonical join key is `userinfo` slot from the
string table, not entity ID. PlayerResource indexing must use the
userinfo slot. Resolve via the `userinfo` string table (M2 TASK-024)
which carries a `slot` field per player. Document this in
`Player.kills` getter: "sourced from PlayerResource.m_iKills at the
player's userinfo slot."

**4. Held overlay references stale after slot reuse.** ADR-002
amendment leaves the mutable-reference trap explicitly unfixed: an
`Entity` reused for a re-spawning player slot keeps its identity but
mutates underneath. M3 makes this user-visible: a consumer who stashes
`const me = parser.players[0]` at round 1 and reads `me.name` at round
20 may see a different player's name (or `StaleEntityError` from
`Entity.assertFresh`, which is the better outcome). **Mitigation:**
`Player` (and Team, Weapon, GameRules) lets `StaleEntityError`
propagate. We do NOT catch and return `undefined` — that would silently
hide bugs. Add a `Player.snapshot()` method that returns a frozen plain
object for consumers who explicitly want the freeze. Document that
overlays are live-views.

**5. CCSGameRulesProxy can be missing for the first N ticks.** Until
the GameRulesProxy entity is created (typically at signon), reading
`parser.gameRules` would crash if we returned a non-undefined overlay
that points at no entity. **Mitigation:** `parser.gameRules` is
`GameRules | undefined`. The internal scan
(`entities.findByServerClass('CCSGameRulesProxy')`) returns
`undefined` until the entity exists. Same for `parser.serverInfo` until
both header and ServerInfo packet are observed. RoundState handles
this by defaulting to `phase: 'pregame'` until the first non-undefined
GameRules read.

**6. Team-side enum mapping is a magic-number minefield.** Source
encodes team membership as `m_iTeamNum` Int with values
`{0: Unassigned, 1: Spectator, 2: T, 3: CT}` (NOTE: I am 80% confident
on this mapping — the golden dump shows `m_iTeamNum` is nBits=6 on
CCSPlayer and nBits=5 on CCSTeam, which doesn't tell us the ordinal
mapping). **Mitigation:** the developer must look up the canonical
mapping from `cstrike15_gcmessages.proto` or demoinfocs's `Team` enum
before implementing, not guess. Add a unit test pinning the mapping
against a known-state demo tick. If we get this wrong, every team
membership query in the library returns swapped sides — a silent
correctness bug.

## Pre-Mortem

Imagine M3 has shipped and is broken. We're a month in, the first
external user is integrating, and they file a bug. What does the
failure look like?

Most likely: the user writes `if (player.team === 'CT')` and gets
inverted results because we mapped 2→CT instead of 3→CT (landmine 6).
The bug is invisible in our tests because we tested *that the team
enum is one of the four values*, not *that the right player is on the
right side*. We notice when the user says "your parser thinks the
losing team is the winning team." Fix is one line, but the user has
already lost trust.

Second-most-likely: a consumer reports `Player.kills` returning zero
for the entire demo. Investigation reveals 018a closed with a fix to
priority-140 ordering, M2 entity decode is now correct, but our
`PlayerResource` overlay is reading from the wrong array index because
we joined on entity ID instead of userinfo slot (landmine 3). Both
parsers agree on the underlying bytes; only the overlay is wrong.

Third: someone profiles a long demo and finds 30% of CPU time in
`Map.get` from `Entity.propByName` because we forgot to add the
overlay-private index cache (landmine 2). Functionally correct,
performance-pathological. Fix is straightforward but invasive across
all four overlay classes.

Fourth: a consumer holds a `Player` reference past a round-end and
re-reads `.name`, gets `StaleEntityError`. They argue this is a bug;
we argue it is the documented contract. The resolution is the
`snapshot()` method we should have added in v1 (landmine 4) to defuse
the argument, which we now ship in v1.1 with an apology.

## Definition of Done for M3

M3 is done when, running against `test/fixtures/de_nuke.dem`, the
parser:

1. After Slice 1 lands: `parser.serverInfo` returns
   `{ mapName: 'de_nuke', tickRate: number, ... }` with all required
   fields populated; `handleToIndex/handleToSerial/isValidHandle`
   utilities pass round-trip unit tests against known-good handle
   bit-patterns.
2. After Slice 2 lands: at the first post-freeze tick of round 1,
   `parser.players` returns an array of length ≥10 with every Player
   exposing `name` (string from `userinfo`), `team` (one of `'CT' |
   'T' | 'SPECTATOR' | 'UNASSIGNED'`), `position` (Vector3 with
   non-NaN floats), `health` (integer in [0..100]), `isAlive` (boolean
   matching `m_lifeState === 0`), `activeWeapon` (Weapon or
   undefined). For at least one weapon, `weapon.owner === player`
   reference equality holds.
3. After Slice 3 lands: `parser.gameRules.roundNumber` equals 1 at the
   start of round 1; `isFreezePeriod` toggles true→false at the
   freeze-end tick; `parser.teams.ct.score + parser.teams.t.score`
   equals total rounds completed at any post-round tick;
   `roundStateChanged` events fire at every round transition with
   correct `from`/`to` phases.
4. **Validation-gap caveat:** assertions on `Player.kills`,
   `Player.deaths`, `Player.matchStats.*`, and any priority-140
   stat-field, are gated `.skip` until TASK-018a closes. This is
   acceptable for M3 DoD because the overlay *shape* is what M3
   guarantees; *value correctness for stats* is a downstream M2 sub-
   milestone that M3 will inherit when it lands.
5. The full suite (existing M2 tests + new M3 unit + integration
   tests) passes against de_nuke without regression.
6. Public exports updated in `src/index.ts` to surface
   `Player | Team | GameRules | Weapon | ServerInfo | RoundState`
   types and the related enums (`TeamSide`, `RoundPhase`, `GamePhase`,
   `WeaponType`).
