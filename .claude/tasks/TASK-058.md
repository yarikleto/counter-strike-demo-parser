# TASK-058: String table snapshot (dem_stringtables frame)

**Milestone:** 5 — Advanced Data
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-022

**Goal:** Handle dem_stringtables frames (type 9) which contain a full snapshot of all string tables at a point in time. This is different from the incremental CreateStringTable/UpdateStringTable messages.

**Acceptance Criteria:**
- [ ] Parse the string table snapshot format (number of tables, each with name, entries count, entries with key + optional data)
- [ ] Update the StringTableManager with snapshot data (overwrite or merge)
- [ ] Handle client-side string table data (extra entries block)
- [ ] Emit `stringTableSnapshot` event

**Cycle:** developer (implements + tests) -> reviewer
