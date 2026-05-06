# TASK-011: Typed event emitter infrastructure

**Milestone:** 1 — Foundation
**Status:** `DONE`
**Size:** S | **Type:** setup
**Depends on:** TASK-001

**Goal:** A type-safe event emitter that provides TypeScript generics for event names and payloads. All parser events flow through this.

**Acceptance Criteria:**
- [ ] `TypedEventEmitter<EventMap>` class with `on()`, `off()`, and `emit()` methods
- [ ] Full type inference: `on('playerDeath', (e) => ...)` infers `e` as `PlayerDeathEvent`
- [ ] Zero external dependencies (built on Node.js EventEmitter or from scratch)

**Cycle:** developer (implements + tests) -> reviewer
