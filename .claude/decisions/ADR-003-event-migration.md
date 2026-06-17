# ADR-003: Migrating DemoParser to TypedEventEmitter

> Status: ACCEPTED | Author: architect | Date: 2026-04-28
> Scope: TASK-011 (already done), early M2 prep before TASK-022 lands

## Decision

DemoParser migrates from `extends EventEmitter` (Node's plain emitter) to
`extends TypedEventEmitter<DemoParserEvents>` *before* TASK-022 ships.
This happens in a small dedicated step at the start of M2 — call it
"slice 0" — that introduces the `DemoParserEvents` event-map type, retypes
the existing `serverInfo` event under it, and ports the existing test in
`test/integration/serverinfo.test.ts` to verify nothing observable
changed. The new M2 events (`stringTableCreated`, `stringTableUpdated`,
`entityCreated`, `entityUpdated`, `entityDeleted`, plus `datatablesReady`
when the SendTables/ServerClasses/Flattening trio completes) are added to
the same event map as they're implemented, one task at a time. The
`DemoParserEvents` map becomes the single source of truth for the public
event surface; consumers gain compile-time errors on misspelled event
names and wrong listener payloads, and we never have a half-typed
emitter in the codebase.

## Why now and not later

We migrate before TASK-022 because every M2 task that adds an event
multiplies the cost of the migration — each new event becomes another
listener-call site to retype, another test to update. The migration is
also cheap right now: there is exactly one event (`serverInfo`), one
emit site, one test. Doing it in slice 0 is a Type 2 decision (revertible
in 30 minutes if it causes a problem) but skipping it pushes a Type 1
mess to M3 when the entire ecosystem of state overlays is already
listening on the untyped surface. The existing `EventEmitter` and
`TypedEventEmitter<TEvents>` have identical runtime behavior — the
difference is purely at the TypeScript level — so the migration is a
type-level rename plus a one-line `extends` change, with no risk to the
runtime behavior consumers depend on. Note that `TypedEventEmitter`'s
`emit` signature is `emit<K>(event: K, payload: TEvents[K]): boolean`,
which means the existing `this.emit("serverInfo", info)` call site in
DemoParser keeps working unchanged. The only file that changes is
`DemoParser.ts` (one import, one extends clause, one event-map
declaration); zero changes to consumers.
