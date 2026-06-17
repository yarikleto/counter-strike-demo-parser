# TASK-023: String table updates (UpdateStringTable)

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-022

**Goal:** Handle CSVCMsg_UpdateStringTable messages. Apply updates to existing string tables using the same history-based decoding.

**Acceptance Criteria:**
- [ ] Finds target table by table ID
- [ ] Decodes updated entries using history-based encoding (same as creation)
- [ ] Correctly overwrites existing entries and appends new ones
- [ ] Emits `stringTableUpdated` event with table name and changed entries

**Cycle:** developer (implements + tests) -> reviewer
