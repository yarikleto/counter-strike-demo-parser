# ADR-004: Overlay Staleness, Caching, and Missing-Entity Semantics

> Status: PROPOSED | Author: architect | Date: 2026-04-29
> Scope: TASK-028 — TASK-035 (all of M3)

## Decision

The four typed overlays exposed by M3 (`Player`, `Team`, `Weapon`,
`GameRules`) are **live views over an underlying `Entity`, not
snapshots.** Every getter call re-reads the latest property value from
`EntityStore` via the underlying `Entity`. Overlays do **not** cache
property values across calls, but **do** cache the integer flat-prop
indices on construction so reads are typed-array dereferences, not
name-string lookups. When a referenced entity does not exist (early
ticks, disconnected player, freed slot), the overlay accessor returns
`undefined` rather than throwing — except when a consumer holds an
overlay reference past entity slot reuse, in which case
`StaleEntityError` propagates from the underlying `Entity` and is the
correct outcome. Snapshots are available on demand via
`overlay.snapshot()`, which returns a `Readonly<{...}>` plain object
with the values frozen at call time.

## Why

These four sub-decisions are individually small but shape every M3
overlay class identically, so locking them in one ADR avoids drift.

**Live views over snapshots.** ADR-002 amendment chose lazy `Entity`
views over preallocated property arrays specifically to avoid hidden
allocations on the hot path. A snapshot-based overlay model would
re-introduce the very pattern ADR-002 rejected: each `entityUpdated`
event would allocate fresh snapshots for every active overlay, then
those snapshots would be GC'd. Live views also match consumer intent —
inside an `entityUpdated` handler, `players[0].position` should reflect
the *just-updated* position, not the snapshot taken at handler
registration. Live views are also the simplest possible implementation:
no invalidation logic, no memoization keys, no cache size limits.

**Per-overlay flat-prop index cache, populated on construction.** The
existing `Entity.propByName(name)` (`src/entities/Entity.ts:69`) does an
O(1) Map.get after a one-time per-ServerClass walk. That is correct for
generic consumers but wasteful for overlays that read the same ~10
prop names on every getter. `Player` resolves `m_vecOrigin`, `m_iHealth`,
`m_iAccount`, `m_iTeamNum`, etc. *once* in its constructor (using
`propByName` underneath, then capturing the resulting integer index) and
stores them as plain `private readonly` numbers. The hot-path read
becomes `entity.prop(this.healthIdx)` — a single typed-array dereference
through `EntityStore.read`. Memory cost: 10–20 numbers × 4 player
overlays = trivial. CPU saved: a `Map.get` per getter call on a
multi-million-call path.

**Missing entity → `undefined`, not throw.** A streaming parser emits
events while the world is being built up. `parser.gameRules` accessed
before the GameRulesProxy entity is decoded must do *something*.
Throwing forces every consumer to wrap reads in try/catch; returning
`undefined` lets the consumer write `parser.gameRules?.roundNumber`,
which is the idiomatic TypeScript way. The same logic applies to
`Weapon.owner` (handle resolves to a freed slot — was dropped this
tick), `parser.players` filtering disconnected slots (entity
`state === 'free'`), and `parser.serverInfo` before header + packet
arrive. Universal rule: **missing is `undefined`, broken is throw.**

**Stale references → throw `StaleEntityError`.** The single exception
to "missing → undefined" is the held-overlay-past-slot-reuse case. A
consumer who stashes `const me = parser.players[0]` at round 1 and
reads `me.name` at round 20 may have their entity slot reused by a
different player. `Entity.assertFresh` (already in
`src/entities/Entity.ts:86`) throws `StaleEntityError` on version
mismatch. The overlay does NOT catch this. Reasoning: silently
returning `undefined` here would hide a real bug in consumer code —
they're reading a player who doesn't exist anymore but they think
they do. A loud throw is the right teaching mechanism. `snapshot()`
exists for consumers who want the freeze.

**`snapshot()` escape hatch.** Every overlay class exposes a
`snapshot(): Readonly<PlayerSnapshot>` (and analogous types). The
return is a plain frozen object with the values resolved at call
time. Use cases: writing a tick to disk, sending state over IPC,
deferring processing past the next tick. We add this in M3 v1 (not
v1.1) because the use case is obvious and the cost is one method per
overlay.

## Alternatives Considered and Rejected

**Snapshots-on-event-emit.** Every `entityCreated` / `entityUpdated`
event payload would carry a frozen snapshot of the entity's state at
emission time. Rejected: re-introduces the per-tick allocation pattern
ADR-002 was explicit about avoiding. Also, the snapshot would still go
stale relative to the *next* tick, so consumers who hold the reference
have the same staleness problem with extra GC pressure.

**Property-level memoization with tick-based invalidation.** Cache
each prop value on first read per tick, invalidate at tick boundary.
Rejected: requires every overlay getter to check a "has the tick
changed?" guard, which adds a comparison per read for negligible
benefit (the underlying `EntityStore.read` is already a typed-array
dereference, it's hard to make faster).

**Throw on missing entity.** Rejected: hostile to the streaming model.
Forces consumers to register listeners *and* try/catch every
`parser.gameRules` read until they figure out the right ordering. The
`?.` operator exists for exactly this case in TypeScript.

**Cached overlay instances on parser.** `parser.players` returns the
same `Player[]` array across calls, with instances reused. Rejected:
forces lifecycle management on the parser (which Player is at slot 7
right now? has the player been replaced?), which is exactly the
complexity ADR-002 amendment pushed *out* of EntityList by introducing
versioned `Entity` views. Consistency: if Entity is allocated fresh on
slot reuse with a new version baseline, Player should be allocated
fresh on every `parser.players` access. Type 2 reversal possible if
profiling demands.

## Open Questions

- `RESEARCH NEEDED:` benchmark `parser.players` array construction
  cost at 64 ticks/sec for an hour-long demo. If allocation pressure
  is measurable, revisit caching policy in M7.
- `RESEARCH NEEDED:` confirm Source's `m_iTeamNum` ordinal mapping
  against `cstrike15_gcmessages.proto` before TASK-030 implementation.
  Most parsers I've seen agree on `{0: Unassigned, 1: Spectator, 2: T,
  3: CT}` but the de_nuke fixture must verify.
