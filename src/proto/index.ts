/**
 * Public re-exports of generated CS:GO protobuf message decoders.
 *
 * The generated TypeScript (in `src/generated/`) uses ts-proto's PascalCase
 * convention which strips underscores from Valve's original message names.
 * Here we re-export under the original Valve names so the rest of the
 * codebase can refer to messages exactly as they appear in the .proto files
 * and Valve documentation.
 *
 * Each message is exposed via the same identifier as both a TYPE and a VALUE
 * (TypeScript's declaration merging across `export type` and `export const`):
 *
 *   import { CSVCMsg_ServerInfo } from '@proto/index';
 *   const info: CSVCMsg_ServerInfo = CSVCMsg_ServerInfo.decode(bytes);
 *
 * The value side is the ts-proto codec object exposing `decode(buf): T`,
 * `encode(msg): Writer`, `fromJSON`, `toJSON`, etc.
 */

import {
  CNETMsgStringCmd,
  CNETMsgTick,
  CSVCMsgClassInfo,
  CSVCMsgCreateStringTable,
  CSVCMsgGameEvent,
  CSVCMsgGameEventList,
  CSVCMsgPacketEntities,
  CSVCMsgSendTable,
  CSVCMsgServerInfo,
  CSVCMsgUpdateStringTable,
} from '../generated/netmessages.js';

// --- net_* messages ---------------------------------------------------------

export type CNETMsg_Tick = CNETMsgTick;
export const CNETMsg_Tick = CNETMsgTick;

export type CNETMsg_StringCmd = CNETMsgStringCmd;
export const CNETMsg_StringCmd = CNETMsgStringCmd;

// --- svc_* messages ---------------------------------------------------------

export type CSVCMsg_ServerInfo = CSVCMsgServerInfo;
export const CSVCMsg_ServerInfo = CSVCMsgServerInfo;

export type CSVCMsg_SendTable = CSVCMsgSendTable;
export const CSVCMsg_SendTable = CSVCMsgSendTable;

export type CSVCMsg_ClassInfo = CSVCMsgClassInfo;
export const CSVCMsg_ClassInfo = CSVCMsgClassInfo;

export type CSVCMsg_PacketEntities = CSVCMsgPacketEntities;
export const CSVCMsg_PacketEntities = CSVCMsgPacketEntities;

export type CSVCMsg_CreateStringTable = CSVCMsgCreateStringTable;
export const CSVCMsg_CreateStringTable = CSVCMsgCreateStringTable;

export type CSVCMsg_UpdateStringTable = CSVCMsgUpdateStringTable;
export const CSVCMsg_UpdateStringTable = CSVCMsgUpdateStringTable;

export type CSVCMsg_GameEvent = CSVCMsgGameEvent;
export const CSVCMsg_GameEvent = CSVCMsgGameEvent;

export type CSVCMsg_GameEventList = CSVCMsgGameEventList;
export const CSVCMsg_GameEventList = CSVCMsgGameEventList;
