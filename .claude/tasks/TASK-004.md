# TASK-004: Protobuf generation pipeline

**Milestone:** 1 — Foundation
**Status:** `DONE`
**Size:** M | **Type:** setup
**Depends on:** TASK-001

**Goal:** Vendor Valve's .proto files, set up ts-proto code generation, and produce typed TypeScript decoders for all CS:GO network messages.

**Acceptance Criteria:**
- [ ] Valve .proto files vendored in `proto/` directory (netmessages.proto, cstrike15_usermessages.proto, cstrike15_gcmessages.proto, etc.)
- [ ] `scripts/generate-proto.sh` runs ts-proto and outputs to `src/generated/`
- [ ] Generated code compiles without errors under strict mode
- [ ] `src/proto/index.ts` re-exports key message types (CSVCMsg_ServerInfo, CSVCMsg_SendTable, CSVCMsg_PacketEntities, etc.)
- [ ] `npm run generate:proto` works end-to-end

**Cycle:** developer (implements + tests) -> reviewer
