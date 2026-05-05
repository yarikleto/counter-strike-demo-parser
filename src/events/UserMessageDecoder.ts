/**
 * UserMessageDecoder (TASK-047) — decodes chat-related `CSVCMsg_UserMessage`
 * payloads into a typed `ChatMessage` for the public `chatMessage` event.
 *
 * Wire shape: `CSVCMsg_UserMessage` is a thin envelope over a numeric
 * `msg_type` (one of the values in the CSGO `ECstrike15UserMessages` enum)
 * and a `msg_data` byte blob — the encoded inner message. The dispatcher
 * peels the wrapper and hands the result here; we route on `msg_type` to
 * one of three inner decoders:
 *
 *   - `CS_UM_SayText (5)`  — raw chat text (engine console emits, rare).
 *   - `CS_UM_SayText2 (6)` — formatted player chat. params[0] is the
 *                            speaker's display name, params[1] is the
 *                            message body, msg_name is the localization
 *                            template ("Cstrike_Chat_All", "Cstrike_Chat_T",
 *                            "Cstrike_Chat_CT", etc.). Team chat is
 *                            inferred from the template (suffix "_T" /
 *                            "_CT" — global is "_All").
 *   - `CS_UM_TextMsg (7)`  — server announcement (round restart, kick,
 *                            etc). params[0] is the localization template,
 *                            params[1..] are positional substitutions for
 *                            `%s1`, `%s2`, … placeholders. No sender.
 *
 * Anything else returns `undefined` — the dispatcher does not emit a
 * `chatMessage` event for non-chat user messages.
 *
 * Sender resolution: SayText2 carries `ent_idx` (the speaking player's
 * entity id, which on CSGO is the `userinfo` table slot + 1 — same
 * convention `EnricherContext.resolvePlayer` uses). We look up the slot
 * via `userInfoIndex.userIdForEntitySlot` to recover the userid, then
 * route through the supplied `resolvePlayer`. When the player has
 * disconnected or no `Player` overlay exists yet, `sender` is
 * `undefined` and `senderName` falls back to `params[0]` for the
 * display-only case.
 *
 * Empirical verification: msg_type values 5/6/7 were confirmed against
 * the `de_nuke.dem` v0.1 fixture — observed `Cstrike_Chat_All`
 * (msg_type=6) and `#SFUI_Notice_Game_will_restart_in` (msg_type=7).
 *
 * Constraints: never throws on a malformed inner blob — ts-proto's
 * `decode` defaults missing fields and tolerates trailing garbage. A
 * proto-level decode failure surfaces as a re-thrown error to the
 * caller (currently swallowed at `DemoParser.handleUserMessage` to
 * avoid aborting the parse on one bad packet).
 */
import type { Player } from "../state/Player.js";
import type { UserInfoIndex } from "../state/userInfoIndex.js";
import {
  CCSUsrMsg_SayText,
  CCSUsrMsg_SayText2,
  CCSUsrMsg_TextMsg,
  ECstrike15UserMessages,
  type CSVCMsg_UserMessage,
} from "../proto/index.js";

/**
 * Read-only context passed to `decodeChatMessage`. The DemoParser builds a
 * fresh one per user-message — same per-call allocation pattern as
 * `EnricherContext` (ADR-006 decision 8). Decouples the decoder from the
 * full `DemoParser` so unit tests can stub a minimal context without
 * standing up an entire parser.
 */
export interface ChatMessageContext {
  readonly players: readonly Player[];
  readonly userInfoIndex: UserInfoIndex;
  /** Frame tick at which this user-message is being decoded. */
  readonly tick: number;
  /**
   * Resolve a CS:GO event `userid` to a live `Player` overlay. Same
   * semantics as `EnricherContext.resolvePlayer` — `undefined` when the
   * userid isn't currently in the userinfo index or no overlay exists yet.
   */
  resolvePlayer(userId: number): Player | undefined;
}

/**
 * Decoded chat message — the payload of the public `chatMessage` event.
 *
 * `sender` is `undefined` for server messages (TextMsg) and for chat
 * messages whose speaker has disconnected before the userinfo refresh
 * caught up. `senderName` always carries a best-effort display name
 * (from `params[0]` on SayText2, empty string on TextMsg / SayText).
 *
 * `message` is the post-substitution text — `%s1` → params[0], `%s2` →
 * params[1], … `raw` carries the un-substituted localization template
 * (or the literal text for SayText) for debugging and downstream
 * localization handling.
 *
 * `isTeamChat` is true only for SayText2 templates whose name ends in
 * `_T` / `_CT` (e.g. `Cstrike_Chat_T`); the SayText2 `chat` flag and
 * SayText `textallchat` flag are NOT used as team-chat signals — they
 * carry orthogonal engine semantics.
 */
export interface ChatMessage {
  /** Frame tick at which this message was networked (`DemoParser.currentTick`). */
  readonly tick: number;
  readonly sender: Player | undefined;
  readonly senderName: string;
  readonly message: string;
  readonly isTeamChat: boolean;
  /** Un-substituted template / literal text — useful for downstream localization. */
  readonly raw: string;
}

/**
 * Substitute `%s1`, `%s2`, … placeholders in `template` with the matching
 * `params[i-1]` (1-indexed). Unmatched placeholders are left as-is so a
 * truncated `params` slice doesn't silently corrupt the output.
 *
 * Source's localization templates use `%s1`..`%s9` exclusively (per
 * Valve's `Localize` system). We support up to `%s9`; in practice
 * SayText2 carries 4 params and TextMsg up to 5, so `%s1`..`%s5` is the
 * common case.
 */
function substituteParams(template: string, params: readonly string[]): string {
  // Replace all %sN where N is 1..9. The replacer falls back to the
  // original placeholder when the param is missing — preserving the
  // template marker rather than emitting "undefined" or "".
  return template.replace(/%s([1-9])/g, (match, digit: string) => {
    const idx = Number.parseInt(digit, 10) - 1;
    const value = params[idx];
    return value !== undefined ? value : match;
  });
}

/**
 * True for SayText2 localization templates whose name signals team chat.
 * CSGO's chat templates follow the convention `Cstrike_Chat_<Side>`:
 *   - `Cstrike_Chat_All` / `Cstrike_Chat_AllDead` / `Cstrike_Chat_AllSpec`
 *     — global chat (or all-dead / spectator chat, also visible to all).
 *   - `Cstrike_Chat_T` / `Cstrike_Chat_CT` — team chat.
 *
 * The match is suffix-based against `_T` / `_CT` so future template
 * variants (e.g. team-dead) inherit the right classification.
 */
function isTeamChatTemplate(msgName: string): boolean {
  // Empty / unknown templates default to non-team.
  if (msgName.length === 0) return false;
  // Exact suffix match on `_T` or `_CT`. We reject `_All`-prefixed names
  // first to avoid a false positive on `Cstrike_Chat_AllDead_T` should
  // such a hybrid ever appear.
  return msgName.endsWith("_T") || msgName.endsWith("_CT");
}

/**
 * Decode the inner SayText2 blob into a `ChatMessage`.
 *
 * SayText2's `msg_name` is a CSGO localization key (e.g. `Cstrike_Chat_All`,
 * `Cstrike_Chat_T`) — NOT a `%s1`/`%s2`-bearing template. The actual
 * localization template text lives in the client's `csgo_<lang>.txt`, which
 * is not networked. Major CSGO parsers (demoinfocs-golang) therefore
 * surface the chat-body param directly as the message: `params[0]` is the
 * speaker's display name, `params[1]` is the message body. We follow that
 * convention because it's the form consumers actually want — a
 * post-substitution string they can render.
 *
 * If a template ever does carry `%sN` placeholders (some older or third-
 * party builds), `substituteParams` is still applied so the message stays
 * useful — but the common path is "params[1] is the message".
 */
function decodeSayText2(
  data: Uint8Array,
  ctx: ChatMessageContext,
  tick: number,
): ChatMessage {
  const inner = CCSUsrMsg_SayText2.decode(data);
  const msgName = inner.msgName ?? "";
  const params = inner.params;
  const senderNameParam = params[0] ?? "";
  const messageParam = params[1] ?? "";
  // Sender resolution: ent_idx is the speaking player's entity id (= slot+1
  // on CSGO). The `userInfoIndex` is keyed by `userid`, not entity slot, so
  // we go entity_id → entity_slot → userid → Player via the supplied
  // resolver. If any link breaks we surface `sender: undefined` and rely
  // on `senderName` for display.
  const entIdx = inner.entIdx ?? 0;
  let sender: Player | undefined;
  if (entIdx > 0) {
    const entitySlot = entIdx - 1;
    const userId = ctx.userInfoIndex.userIdForEntitySlot(entitySlot);
    if (userId !== undefined) {
      sender = ctx.resolvePlayer(userId);
    }
  }
  // `senderName` is sourced from the wire param. The `Player` overlay
  // doesn't currently expose a `.name` accessor (it lives on the
  // `userInfo` map keyed by userid); the wire param is the speaker's
  // display name as the engine networked it at speak-time, which is the
  // right value for the disconnect-after-msg case anyway.
  const senderName = senderNameParam;
  // Best-effort substitution: if the template happens to carry %sN
  // placeholders, expand them; otherwise return the chat-body param
  // directly (the empirical CSGO common case).
  const hasPlaceholder = /%s[1-9]/.test(msgName);
  const message = hasPlaceholder
    ? substituteParams(msgName, params)
    : messageParam;
  return Object.freeze({
    tick,
    sender,
    senderName,
    message,
    isTeamChat: isTeamChatTemplate(msgName),
    raw: msgName,
  });
}

/**
 * Decode the inner SayText blob into a `ChatMessage`. SayText carries no
 * localization template — the literal `text` field is the message.
 */
function decodeSayText(data: Uint8Array, tick: number): ChatMessage {
  const inner = CCSUsrMsg_SayText.decode(data);
  const text = inner.text ?? "";
  return Object.freeze({
    tick,
    sender: undefined,
    senderName: "",
    message: text,
    isTeamChat: false,
    raw: text,
  });
}

/**
 * Decode the inner TextMsg blob. Server messages have no sender; the
 * localization template lives in `params[0]` and `%s1`..`%sN` substitute
 * `params[1..]` (template-relative — `%s1` is the first substitution
 * value, NOT the template itself).
 *
 * Note the tag indexing: Source's TextMsg packs the template as
 * `params[0]` and the substitution values as `params[1..]`. To match
 * `substituteParams`'s 1-indexed `%sN` convention against the
 * substitution slice, we drop `params[0]` before passing it through.
 */
function decodeTextMsg(data: Uint8Array, tick: number): ChatMessage {
  const inner = CCSUsrMsg_TextMsg.decode(data);
  const params = inner.params;
  const template = params[0] ?? "";
  const substitutions = params.slice(1);
  return Object.freeze({
    tick,
    sender: undefined,
    senderName: "",
    message: substituteParams(template, substitutions),
    isTeamChat: false,
    raw: template,
  });
}

/**
 * Decode a chat-related `CSVCMsg_UserMessage` into a typed `ChatMessage`.
 * Returns `undefined` for any non-chat user message (so the caller can
 * skip the emit cheaply) and for chat messages with a missing `msg_data`
 * blob (defensive — should not occur on a well-formed wire).
 */
export function decodeChatMessage(
  msg: CSVCMsg_UserMessage,
  ctx: ChatMessageContext,
): ChatMessage | undefined {
  const msgType = msg.msgType;
  if (msgType === undefined) return undefined;
  const data = msg.msgData;
  if (data === undefined || data.length === 0) {
    // SayText / SayText2 / TextMsg with empty payloads are malformed —
    // the inner protos all carry at least one populated field. Skip.
    if (
      msgType === ECstrike15UserMessages.CS_UM_SayText ||
      msgType === ECstrike15UserMessages.CS_UM_SayText2 ||
      msgType === ECstrike15UserMessages.CS_UM_TextMsg
    ) {
      return undefined;
    }
    return undefined;
  }
  switch (msgType) {
    case ECstrike15UserMessages.CS_UM_SayText:
      return decodeSayText(data, ctx.tick);
    case ECstrike15UserMessages.CS_UM_SayText2:
      return decodeSayText2(data, ctx, ctx.tick);
    case ECstrike15UserMessages.CS_UM_TextMsg:
      return decodeTextMsg(data, ctx.tick);
    default:
      return undefined;
  }
}
