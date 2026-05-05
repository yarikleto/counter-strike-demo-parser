import { describe, it, expect } from "vitest";
import {
  decodeChatMessage,
  type ChatMessageContext,
} from "../../../src/events/UserMessageDecoder.js";
import {
  CSVCMsg_UserMessage,
  CCSUsrMsg_SayText,
  CCSUsrMsg_SayText2,
  CCSUsrMsg_TextMsg,
  ECstrike15UserMessages,
} from "../../../src/proto/index.js";
import type { Player } from "../../../src/state/Player.js";
import type { UserInfoIndex, UserInfo } from "../../../src/state/userInfoIndex.js";

/**
 * Build a `ChatMessageContext` stand-in for the unit test. The real context
 * is built inside `DemoParser.handleUserMessage` from `parser.userInfoIndex`
 * + `parser.players`; here we stub it directly so the decoder can be tested
 * in isolation from the parser.
 */
function makeCtx(opts: {
  /** entitySlot returned for the lookup userid (undefined → not in index). */
  entitySlot?: number;
  /** userid the index reports for the (entitySlot → userid) reverse lookup. */
  userId?: number;
  /** UserInfo returned for the lookup userid. */
  info?: UserInfo;
  /** Players list — Player.slot must equal entitySlot+1 for resolution. */
  players?: Player[];
  /** Frame tick to surface in the resulting `ChatMessage`. */
  tick?: number;
}): ChatMessageContext {
  const players = opts.players ?? [];
  const fakeIndex = {
    entitySlotForUserId(_userId: number): number | undefined {
      return opts.entitySlot;
    },
    infoForUserId(_userId: number): UserInfo | undefined {
      return opts.info;
    },
    userIdForEntitySlot(slot: number): number | undefined {
      if (opts.entitySlot === undefined) return undefined;
      if (slot !== opts.entitySlot) return undefined;
      return opts.userId;
    },
  } as unknown as UserInfoIndex;
  return Object.freeze({
    players,
    userInfoIndex: fakeIndex,
    tick: opts.tick ?? 0,
    resolvePlayer(_userId: number): Player | undefined {
      const slot = opts.entitySlot;
      if (slot === undefined) return undefined;
      const entityId = slot + 1;
      for (const p of players) if (p.slot === entityId) return p;
      return undefined;
    },
  });
}

/** Encode a `CCSUsrMsg_SayText2` body and wrap it in a `CSVCMsg_UserMessage`. */
function wrapSayText2(body: {
  entIdx?: number;
  chat?: boolean;
  msgName?: string;
  params?: string[];
  textallchat?: boolean;
}): CSVCMsg_UserMessage {
  const inner = CCSUsrMsg_SayText2.encode(
    CCSUsrMsg_SayText2.fromPartial({
      entIdx: body.entIdx ?? 0,
      chat: body.chat ?? false,
      msgName: body.msgName ?? "",
      params: body.params ?? [],
      textallchat: body.textallchat ?? false,
    }),
  ).finish();
  return CSVCMsg_UserMessage.fromPartial({
    msgType: ECstrike15UserMessages.CS_UM_SayText2,
    msgData: inner,
  });
}

function wrapSayText(body: {
  entIdx?: number;
  text?: string;
  chat?: boolean;
  textallchat?: boolean;
}): CSVCMsg_UserMessage {
  const inner = CCSUsrMsg_SayText.encode(
    CCSUsrMsg_SayText.fromPartial({
      entIdx: body.entIdx ?? 0,
      text: body.text ?? "",
      chat: body.chat ?? false,
      textallchat: body.textallchat ?? false,
    }),
  ).finish();
  return CSVCMsg_UserMessage.fromPartial({
    msgType: ECstrike15UserMessages.CS_UM_SayText,
    msgData: inner,
  });
}

function wrapTextMsg(body: {
  msgDst?: number;
  params?: string[];
}): CSVCMsg_UserMessage {
  const inner = CCSUsrMsg_TextMsg.encode(
    CCSUsrMsg_TextMsg.fromPartial({
      msgDst: body.msgDst ?? 0,
      params: body.params ?? [],
    }),
  ).finish();
  return CSVCMsg_UserMessage.fromPartial({
    msgType: ECstrike15UserMessages.CS_UM_TextMsg,
    msgData: inner,
  });
}

describe("decodeChatMessage", () => {
  describe("SayText2 (formatted player chat)", () => {
    it("decodes a global Cstrike_Chat_All message — sender resolves via userinfo index", () => {
      // entitySlot 0 + params[0] is "Brian". The +1 entityId convention means
      // we look up a Player.slot === 1.
      const fakePlayer = { slot: 1, name: "Brian" } as unknown as Player;
      const ctx = makeCtx({
        entitySlot: 0,
        userId: 131,
        info: Object.freeze({
          name: "Brian",
          xuid: "0",
          isFakePlayer: true,
          entitySlot: 0,
        }),
        players: [fakePlayer],
      });
      const msg = wrapSayText2({
        entIdx: 1, // engine ent_idx is the entity id = slot+1
        chat: true,
        msgName: "Cstrike_Chat_All",
        params: ["Brian", "glhf", "", ""],
        textallchat: false,
      });

      const decoded = decodeChatMessage(msg, ctx);

      expect(decoded).toBeDefined();
      expect(decoded!.sender).toBe(fakePlayer);
      expect(decoded!.senderName).toBe("Brian");
      expect(decoded!.message).toBe("glhf");
      expect(decoded!.isTeamChat).toBe(false);
      expect(decoded!.raw).toBe("Cstrike_Chat_All");
    });

    it("flags Cstrike_Chat_T / Cstrike_Chat_CT as team chat", () => {
      const ctx = makeCtx({});
      const msg = wrapSayText2({
        entIdx: 0,
        chat: true,
        msgName: "Cstrike_Chat_T",
        params: ["Speaker", "rush b", "", ""],
      });

      const decoded = decodeChatMessage(msg, ctx)!;

      expect(decoded.isTeamChat).toBe(true);
      expect(decoded.senderName).toBe("Speaker");
      expect(decoded.message).toBe("rush b");
    });

    it("returns sender=undefined when the userinfo index has no entry for ent_idx", () => {
      const ctx = makeCtx({}); // empty index
      const msg = wrapSayText2({
        entIdx: 7,
        msgName: "Cstrike_Chat_All",
        params: ["Ghost", "hi"],
      });

      const decoded = decodeChatMessage(msg, ctx)!;

      expect(decoded.sender).toBeUndefined();
      // senderName should still come from params[0] for the disconnect-after-msg case.
      expect(decoded.senderName).toBe("Ghost");
      expect(decoded.message).toBe("hi");
    });
  });

  describe("SayText (raw chat text)", () => {
    it("decodes the raw `text` field as the message body", () => {
      const ctx = makeCtx({});
      const msg = wrapSayText({
        entIdx: 0,
        text: "Server: gg",
        chat: false,
        textallchat: true,
      });

      const decoded = decodeChatMessage(msg, ctx)!;

      // SayText carries no localization template — message and raw are the
      // literal text. No sender (entIdx 0 is the engine).
      expect(decoded.sender).toBeUndefined();
      expect(decoded.senderName).toBe("");
      expect(decoded.message).toBe("Server: gg");
      expect(decoded.raw).toBe("Server: gg");
      // textallchat doesn't imply team chat — only the SayText2 msg_name does.
      expect(decoded.isTeamChat).toBe(false);
    });
  });

  describe("TextMsg (server announcement)", () => {
    it("decodes a server message with no sender", () => {
      const ctx = makeCtx({});
      // The empirical de_nuke.dem TextMsg payload: msg_dst=4, params[0] is the
      // template, params[1..] are the substitution values.
      const msg = wrapTextMsg({
        msgDst: 4,
        params: [
          "#SFUI_Notice_Game_will_restart_in",
          "1",
          "#SFUI_Second",
          "",
          "",
        ],
      });

      const decoded = decodeChatMessage(msg, ctx)!;

      expect(decoded.sender).toBeUndefined();
      expect(decoded.senderName).toBe("");
      expect(decoded.raw).toBe("#SFUI_Notice_Game_will_restart_in");
      // Message is the un-formatted template — substitution is best-effort.
      expect(decoded.message.length).toBeGreaterThan(0);
      expect(decoded.isTeamChat).toBe(false);
    });
  });

  describe("non-chat user messages", () => {
    it("returns undefined for a user message with an unknown msgType", () => {
      const ctx = makeCtx({});
      const msg = CSVCMsg_UserMessage.fromPartial({
        msgType: 999, // not SayText / SayText2 / TextMsg
        msgData: new Uint8Array([0x08, 0x01]),
      });

      const decoded = decodeChatMessage(msg, ctx);

      expect(decoded).toBeUndefined();
    });

    it("returns undefined when msgType is missing", () => {
      const ctx = makeCtx({});
      const msg = CSVCMsg_UserMessage.fromPartial({});
      expect(decodeChatMessage(msg, ctx)).toBeUndefined();
    });

    it("returns undefined when msgData is missing for a chat msgType", () => {
      const ctx = makeCtx({});
      const msg = CSVCMsg_UserMessage.fromPartial({
        msgType: ECstrike15UserMessages.CS_UM_SayText2,
        msgData: undefined,
      });
      expect(decodeChatMessage(msg, ctx)).toBeUndefined();
    });
  });

  describe("tick propagation", () => {
    it("propagates ctx.tick onto the decoded ChatMessage for all three variants", () => {
      const ctx = makeCtx({ tick: 12345 });

      const sayText2 = decodeChatMessage(
        wrapSayText2({ msgName: "Cstrike_Chat_All", params: ["A", "hi", "", ""] }),
        ctx,
      )!;
      const sayText = decodeChatMessage(wrapSayText({ text: "*DEAD*" }), ctx)!;
      const textMsg = decodeChatMessage(wrapTextMsg({ params: ["Server says hi"] }), ctx)!;

      expect(sayText2.tick).toBe(12345);
      expect(sayText.tick).toBe(12345);
      expect(textMsg.tick).toBe(12345);
    });
  });
});
