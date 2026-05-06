# ADR-005: Typed Overlay Pattern (M3)

> Status: ACCEPTED | Author: architect | Date: 2026-04-30
> Scope: TASK-028, TASK-029a, TASK-030, TASK-031, TASK-033, TASK-035 — every
> typed-state class added in M3.

## Context

ADR-004 fixed the *behavioral* contract for typed overlays — live views,
construct-time index cache, missing → `undefined`, stale → throw, plus a
`snapshot()` escape hatch. It deliberately said nothing about layout,
naming, or how an overlay attaches to a raw entity. Three more overlays
ship next in parallel (`PlayerResource` rework via TASK-029a, `Team` via
TASK-030, `GameRules` via TASK-033) and the two already in `main`
(`Player` via TASK-028 in `src/state/Player.ts`, `Weapon` via TASK-031 in
`src/state/Weapon.ts`) drifted on naming. We lock the missing rules now,
before three developers fan out and bake the drift in.

## Decision

**1. Location.** Every overlay is a single file in `src/state/`,
exported from `src/state/index.ts`. The file is named after the class
(`Player.ts`, `Weapon.ts`, `PlayerResource.ts`, `ServerInfo.ts`). New
overlays follow: `Team.ts`, `GameRules.ts`. No subdirectories.
`src/state/EntityHandle.ts` carries the shared handle-resolution helper
(`resolveHandle`, `INVALID_HANDLE`, `isValidHandle`) used by any overlay
that needs to follow `m_h*` pointers — TASK-030 and TASK-033 both will.

**2. Attachment.** An overlay class takes an `Entity` in its
constructor, walks `entity.serverClass.flattenedProps` exactly once to
resolve the integer flat-prop index of every property it exposes, and
caches those indices as `private readonly` numbers. Hot-path getters do
`this.entity.store.read(this.entity.storageSlot, this.<x>Idx)` — a
single typed-array dereference. No per-getter `propByName` lookup, no
value memoization. This matches what `Player.ts` and `Weapon.ts` already
do (see `Player.ts:81-96` `findIdx`, `Weapon.ts:86-96` inline closure).
TASK-030/033 should pull the local `findIdx` helper from `Player.ts` —
it threads an optional `sourceTableName` for prop disambiguation, which
`Weapon`'s simpler version does not. **Canonical helper: copy
`Player.ts:81-115` (`findIdx` + `findIdxFallback`).**

**3. Property naming.** Strip the Hungarian `m_` prefix, strip the
single-char type sigil (`i` int, `fl` float, `ang` angle, `vec` vector,
`b` bool, `sz` C-string, `n` net-quantized), and camelCase the
remainder. `m_iTeamNum` → `team`. `m_iHealth` → `health`. `m_iAccount` →
`money` (semantic rename allowed when the Source name is misleading;
document in the JSDoc). `m_lifeState` → `isAlive` (boolean derivation,
not a passthrough). `m_iClip1`/`m_iClip2` keep the trailing digit
(`clip1`, `clip2`) — semantic disambiguator, not a sigil.

`m_h*` (entity handle) properties expose the **raw integer** with the
suffix `Handle` (not the resolved `Entity`/overlay): `m_hActiveWeapon` →
`activeWeaponHandle`, `m_hOwnerEntity` → `ownerHandle`. Resolution to
the target overlay is the caller's job, not the overlay's — overlays
have no `EntityList` reference by design (ADR-004 alternatives §4).

**4. Array-indexed overlays (PlayerResource shape).** When a Source
entity carries per-slot stat arrays (`m_iKills.000`..`.063`), expose
each stat as a method `<stat>ForSlot(slot: number): number`, NOT as a
flat array property. Out-of-range slots return `0`, not throw — callers
iterate `0..MAX_PLAYER_SLOTS-1` and shouldn't bounds-check every read.
The `snapshot()` return shape may collect into a `readonly number[]`
since the snapshot is a one-shot copy. TASK-029a inherits this; it is
already what `src/state/PlayerResource.ts:83-101` does and TASK-029a
must not change it. The naming is `<stat>ForSlot`, singular — `kills`
the array becomes `killsForSlot(slot)`, never `getKills(slot)` or
`kills[slot]`.

**5. Missing-source semantics.** ADR-004 governs: missing source entity
at the parser-getter layer (`parser.gameRules` before the proxy entity
exists) returns `undefined`. Inside an overlay, the constructor throws
on schema mismatch (a required prop is absent from `flattenedProps`) —
that's a "broken, not missing" condition. Per-getter reads of
never-written props default to `0` for numeric props (see
`Weapon.ts:117-120` `readNum`, `Player.ts:123-125` `readNumOr0`).
String-valued props should default to `""` and boolean derivations to
`false`. This is consistent across all five existing overlays.

**6. Class naming.** Use the bare Source class name minus the `CCS` /
`CWeapon` prefix: `CCSPlayer` → `Player`, `CCSPlayerResource` →
`PlayerResource`, `CCSTeam` → `Team`, `CCSGameRulesProxy` → `GameRules`
(drop the `Proxy` — it's a Source-engine implementation detail, not a
domain concept). `CWeaponCSBase` and its subclasses → `Weapon`. The
`ServerInfo` overlay is the exception: it is built from a protobuf
message + the demo header, not from an `Entity`, so it lives in
`src/state/ServerInfo.ts` as a `buildServerInfo()` factory returning a
frozen `TypedServerInfo` interface (no class, no flat-prop indices, no
`snapshot()` — it is already immutable). `TypedServerInfo` is the only
overlay with the `Typed` prefix; the prefix marks it as the "joined,
typed projection" of two raw inputs and distinguishes it from the
parser's `serverInfo` getter that returns the raw `CSVCMsg_ServerInfo`.
Do not use the `Typed` prefix on entity-backed overlays.

## Inconsistencies in shipped code

`Player.ts` factors `findIdx` / `findIdxFallback` as file-level
functions and threads `sourceTableName` for the `DT_CSLocalPlayerExclusive`
/ `DT_CSNonLocalPlayerExclusive` split. `Weapon.ts` inlines a simpler
closure with no source-table parameter. **The Player version is
canonical** — Team and GameRules don't need the local/non-local split
today, but threading the optional parameter costs nothing and prevents
the next overlay from re-introducing the inline form. We do not
retrofit Weapon now (Type 2; revisit only if a weapon prop turns out to
need disambiguation).

`Player` is constructed with `(slot, entity)`; `Weapon` and
`PlayerResource` are constructed with `(entity)` only. Player's slot
is the entity id, useful because consumers iterate by player slot.
Team and GameRules take `(entity)` only — there is no per-instance
identifier the consumer needs that isn't on the entity itself.

## Pre-mortem

What goes wrong if developers ignore this ADR? Three overlays land with
three different naming schemes (`team` vs `teamNum` vs `getTeam()`), the
public API ships inconsistent, and v0.1 is the embarrassment we never
get to fix because consumers depend on the bad names. Locking now is
cheap; locking after release is not.
