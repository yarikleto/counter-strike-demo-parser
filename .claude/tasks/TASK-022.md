# TASK-022: String table creation (CreateStringTable)

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-009

**Goal:** Handle CSVCMsg_CreateStringTable message. Parse string table entries using the history-based encoding and store them in a StringTable data structure.

**Acceptance Criteria:**
- [ ] StringTable class with name, maxEntries, entries (key + optional userData)
- [ ] StringTableManager tracks all tables by name and index
- [ ] History-based entry decoding: substring references from previous entries
- [ ] Fixed-size user data tables handled correctly
- [ ] Variable-size user data: read 14-bit length then data bytes
- [ ] Emits `stringTableCreated` event

**Cycle:** developer (implements + tests) -> reviewer
