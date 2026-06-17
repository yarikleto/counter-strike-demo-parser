# TASK-037b: userInfoIndex — userid → Player resolver

**Milestone:** 4 — Events (infra)
**Status:** `READY`
**Size:** S | **Type:** infra
**Depends on:** TASK-022 (CreateStringTable / userinfo table)
**Filed:** 2026-05-03 (CEO, after ADR-006 identified this as the highest-leverage M4 prerequisite)

## Why this exists

ADR-006 (Tier-1 event enrichment pattern) hinges on resolving CS:GO event `userid` fields to live `Player` overlays. Userids are NOT entity slot indices — they're indices into the `userinfo` string-table, whose user-data blob is the Source-engine `player_info_t` struct (containing the entity slot, steamID/XUID, name, fake-player flag, etc.). Without a single canonical decoder, nine parallel TASK-038/039/.../046 developers would each write their own broken implementation against the raw `Uint8Array` exposed by the userinfo table today.

## What ships in this task

1. **`src/state/userInfoIndex.ts`** — pure module wrapping a `UserInfoIndex` class with:
   - Construction from the `StringTableRegistry`'s `userinfo` table.
   - Subscription to `userinfo`-table `entryUpdated` so the index stays live across the parse.
   - `entitySlotForUserId(userId: number): number | undefined`
   - `infoForUserId(userId: number): { name: string; xuid: string; isFakePlayer: boolean; entitySlot: number } | undefined`
   - `userIdForEntitySlot(entitySlot: number): number | undefined` (reverse lookup, used by some enrichers)

2. **`player_info_t` blob decoder** — Source layout (CS:GO build):
   ```
   uint64 xuid           // 8 bytes
   char   name[128]      // 128 bytes (null-terminated)
   int    userid         // 4 bytes
   char   guid[33]       // 33 bytes (null-terminated steamID2)
   uint32 friendsId      // 4 bytes
   char   friendsName[128] // 128 bytes
   bool   fakeplayer     // 1 byte
   bool   ishltv         // 1 byte
   uint32 customFiles[4] // 16 bytes
   uchar  filesDownloaded // 1 byte
   ```
   Endianness: big-endian for xuid (network order). Parse via `ByteReader` already in the codebase.

3. **DemoParser wiring:** `parser.userInfoIndex` getter returns the live index. Built lazily on first access OR eagerly when the `userinfo` table is created (mirror how `gameRules` is wired).

4. **Tests:**
   - Unit (`test/unit/state/userInfoIndex.test.ts`): synthetic blobs covering happy path, fake-player flag, missing-name, malformed-blob (short read).
   - Integration (`test/integration/userinfo-index.test.ts`): on de_nuke.dem, after `parseAll()`, assert ≥10 userids resolve, every resolved info has a non-empty name, and `entitySlotForUserId(<some live userid>)` returns a slot in `[0, 64)`.

## Acceptance criteria

- [ ] `parser.userInfoIndex` returns a live `UserInfoIndex` after parseAll.
- [ ] All 9 fields of `player_info_t` are parsed correctly on de_nuke.
- [ ] Index updates as players (re)connect mid-demo (covered by integration test).
- [ ] Unit + integration tests pass; full suite remains 543/543 green.

## Cycle

developer → reviewer

## Notes

- This is `state/` not `events/` — the userid-resolver belongs with player-state plumbing, not with event-decode. ADR-006 explicitly puts it under `src/state/`.
- DO NOT add Tier-1 enrichers in this task — that's TASK-038+ scope. Stay minimal.
- The `bool fakeplayer` and `bool ishltv` are 1-byte values in the blob, not packed bits.
- Reference: demoinfocs-golang's `userinfo.go` if you need a sanity-check on field ordering.
