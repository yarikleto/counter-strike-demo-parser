# Vendored Valve `.proto` files

Source schemas describing CS:GO network messages. These files are the input to
`scripts/generate-proto.sh`, which uses [`ts-proto`](https://github.com/stephenh/ts-proto)
to produce TypeScript decoders in `src/generated/`.

## Source

| Field | Value |
| --- | --- |
| Upstream repo | [`markus-wa/demoinfocs-golang`](https://github.com/markus-wa/demoinfocs-golang) |
| Subpath | `pkg/demoinfocs/msg/proto/` |
| Commit (CSGO-era, last before CS2 rewrite) | `a68aa2fbae56999ab4c985a78b6b536c5ae3fb4b` |
| Commit date | 2022-07-27 |
| Original Valve source | [`SteamDatabase/Protobufs`](https://github.com/SteamDatabase/Protobufs) `csgo/` subset, mirrored by markus-wa |
| Mirror commit | `2f826b9bc2524bb05ecaa4dc4a787af4eaee0f14` (per markus-wa CI message) |

The `markus-wa/demoinfocs-golang` Go parser is the gold-standard CS:GO demo
parser and maintains a pre-curated, known-good subset of Valve's protobufs that
omits Source 2 / GC matchmaking files we do not need. We mirror their CSGO-era
file list to avoid the Source 2 contamination problem (see TASK-004 retry
brief).

## Vendored files

Currently the minimal set required by the public re-exports in
`src/proto/index.ts`:

- `netmessages.proto` — defines `net_*` (`CNETMsg_Tick`, `CNETMsg_StringCmd`,
  ...) and `svc_*` (`CSVCMsg_ServerInfo`, `CSVCMsg_SendTable`,
  `CSVCMsg_ClassInfo`, `CSVCMsg_PacketEntities`, `CSVCMsg_CreateStringTable`,
  `CSVCMsg_UpdateStringTable`, `CSVCMsg_GameEvent`, `CSVCMsg_GameEventList`,
  ...). Imports only `google/protobuf/descriptor.proto` (provided by `protoc`).

This single file covers every message currently re-exported by
`src/proto/index.ts`. Additional CS:GO `.proto` files
(`cstrike15_usermessages.proto`, `cstrike15_gcmessages.proto`,
`steammessages.proto`, etc.) can be added in later tasks when their messages
are actually consumed; the generation script picks them up automatically.

## Explicitly NOT vendored

To prevent the failure mode that stalled the previous attempt, the following
are **out of scope** for this parser:

- Anything `source2_*` (CS2 / Source 2 engine — different demo format)
- `gcsdk_gcmessages.proto`, `engine_gcmessages.proto` (Steam GC plumbing)
- Anything `dota*`, `dota2*`
- Steam network plumbing (`steamdatagram_*`, `steamnetworkingsockets_*`)

If a future task needs a message from one of these, prefer adding only the
specific file and pruning its imports rather than vendoring the whole upstream
tree.

## Regenerating

```sh
npm run generate:proto
```

Requires `protoc` on `PATH` (`brew install protobuf`).

## Updating the vendored files

1. Pick a new upstream commit on `markus-wa/demoinfocs-golang` *before* commit
   `90a93a52` (the "remove csgo support" commit on 2024-12-02) — anything after
   is CS2-only.
2. Re-download with `curl` (see the script that produced the current snapshot
   in the git history of this directory).
3. Run `npm run generate:proto` and `npm run typecheck`.
4. Update the commit SHA in this README.
