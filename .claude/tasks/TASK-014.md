# TASK-014: ServerClass registration + ClassInfo handling

**Milestone:** 2 — Core Protocol
**Status:** `DONE`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-013

**Goal:** Handle CSVCMsg_ClassInfo message, register ServerClasses that map class IDs to SendTable names, and link each ServerClass to its root SendTable.

**Acceptance Criteria:**
- [ ] Parse ClassInfo message: array of (classId, dataTableName, className)
- [ ] Create ServerClass objects linking classId -> className -> root SendTable
- [ ] Store in a registry indexed by classId for entity creation

**Cycle:** developer (implements + tests) -> reviewer
