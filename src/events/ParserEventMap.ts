/**
 * ParserEventMap — complete TypeScript event map for {@link DemoParser}.
 *
 * The map is composed from three distinct tiers, reflecting how the parser
 * surfaces game data at progressively higher levels of abstraction:
 *
 * **Tier 1 — Enriched events** (`Tier1EventMap`):
 *   One key per enriched CS:GO game event. Keys are the raw CS:GO wire names
 *   (e.g. `"player_death"`, `"bomb_planted"`). Payloads are rich typed
 *   interfaces with `Player` references, enum fields, and normalised
 *   booleans — the "analyst-friendly" form. Subscribe here for the ~47 events
 *   that cover the vast majority of match analysis needs.
 *   Exception: `chatMessage` uses camelCase because it is emitted by the
 *   user-message decoder path, not the game-event enricher dispatch.
 *
 * **Tier 2 — Raw typed catch-all** (`Tier2EventMap`):
 *   `gameEvent: DecodedGameEvent` fires for EVERY game event on the wire
 *   (169+ in CS:GO). The payload is a self-describing record with raw field
 *   names and values taken directly from the demo's descriptor schema.
 *   Use this tier for rare or Danger-Zone-only events that lack a Tier-1
 *   enricher, or when you need the raw wire values before enrichment.
 *   Tier 2 fires BEFORE Tier 1 for the same event tick.
 *
 * **Tier 3 — Parser-synthetic events** (`Tier3EventMap`):
 *   Structural events the parser emits from its own machinery — entity
 *   lifecycle, string-table mutations, server info, round-phase transitions.
 *   These are NOT game events; they have no CS:GO descriptor-table entry.
 */
import type { DecodedGameEvent } from "./GameEventDecoder.js";
import type { EventDescriptorTable } from "./EventDescriptorTable.js";
import type { ChatMessage } from "./UserMessageDecoder.js";
import type { Entity } from "../entities/Entity.js";
import type { StringTable } from "../stringtables/StringTable.js";
import type { StringTableEntry } from "../stringtables/StringTable.js";
import type { DecodedStringTableSnapshot } from "../stringtables/SnapshotParser.js";
import type { CSVCMsg_ServerInfo } from "../proto/index.js";
import type { RoundStateChange } from "../state/RoundTracker.js";
// Tier-1 enriched event types — bomb lifecycle (TASK-039)
import type { BombAbortDefuseEvent } from "./enrichers/bombAbortDefuse.js";
import type { BombAbortPlantEvent } from "./enrichers/bombAbortPlant.js";
import type { BombBeginDefuseEvent } from "./enrichers/bombBeginDefuse.js";
import type { BombBeginPlantEvent } from "./enrichers/bombBeginPlant.js";
import type { BombDefusedEvent } from "./enrichers/bombDefused.js";
import type { BombDroppedEvent } from "./enrichers/bombDropped.js";
import type { BombExplodedEvent } from "./enrichers/bombExploded.js";
import type { BombPickedUpEvent } from "./enrichers/bombPickedUp.js";
import type { BombPlantedEvent } from "./enrichers/bombPlanted.js";
// Combat & player actions (TASK-038)
import type { BulletImpactEvent } from "./enrichers/bulletImpact.js";
import type { OtherDeathEvent } from "./enrichers/otherDeath.js";
import type { PlayerBlindEvent } from "./enrichers/playerBlind.js";
import type { PlayerDeathEvent } from "./enrichers/playerDeath.js";
import type { PlayerGivenC4Event } from "./enrichers/playerGivenC4.js";
import type { PlayerHurtEvent } from "./enrichers/playerHurt.js";
import type { PlayerSpawnedEvent } from "./enrichers/playerSpawned.js";
// Grenade lifecycle (TASK-041)
import type { DecoyDetonateEvent } from "./enrichers/decoyDetonate.js";
import type { FlashbangDetonateEvent } from "./enrichers/flashbangDetonate.js";
import type { GrenadeBounceEvent } from "./enrichers/grenadeBounce.js";
import type { GrenadeThrownEvent } from "./enrichers/grenadeThrown.js";
import type { HeGrenadeDetonateEvent } from "./enrichers/heGrenadeDetonate.js";
// Hostage events (TASK-045)
import type { HostagePickedUpEvent } from "./enrichers/hostagePickedUp.js";
import type { HostageHurtEvent } from "./enrichers/hostageHurt.js";
import type { HostageRescuedEvent } from "./enrichers/hostageRescued.js";
import type { InfernoExpiredEvent } from "./enrichers/infernoExpired.js";
// Item lifecycle (TASK-043)
import type { ItemEquipEvent } from "./enrichers/itemEquip.js";
import type { ItemPickupEvent } from "./enrichers/itemPickup.js";
import type { ItemPurchaseEvent } from "./enrichers/itemPurchase.js";
import type { MolotovDetonateEvent } from "./enrichers/molotovDetonate.js";
import type { SmokeGrenadeDetonateEvent } from "./enrichers/smokeGrenadeDetonate.js";
import type { SmokeGrenadeExpiredEvent } from "./enrichers/smokeGrenadeExpired.js";
// Player connection lifecycle (TASK-042)
import type { PlayerConnectEvent } from "./enrichers/playerConnect.js";
import type { PlayerDisconnectEvent } from "./enrichers/playerDisconnect.js";
import type { PlayerTeamChangeEvent } from "./enrichers/playerTeamChange.js";
// Round lifecycle (TASK-040)
import type { RoundEndEvent } from "./enrichers/roundEnd.js";
import type { RoundFreezeEndEvent } from "./enrichers/roundFreezeEnd.js";
import type { RoundPoststartEvent } from "./enrichers/roundPoststart.js";
import type { RoundPrestartEvent } from "./enrichers/roundPrestart.js";
import type { RoundStartEvent } from "./enrichers/roundStart.js";
// Weapon events (TASK-044)
import type { WeaponFireEvent } from "./enrichers/weaponFire.js";
import type { WeaponReloadEvent } from "./enrichers/weaponReload.js";
import type { WeaponZoomEvent } from "./enrichers/weaponZoom.js";
// Miscellaneous match-state events (TASK-046)
import type { AnnouncePhaseEndEvent } from "./enrichers/announcePhaseEnd.js";
import type { BeginNewMatchEvent } from "./enrichers/beginNewMatch.js";
import type { BotTakeoverEvent } from "./enrichers/botTakeover.js";
import type { CsWinPanelMatchEvent } from "./enrichers/csWinPanelMatch.js";
import type { CsWinPanelRoundEvent } from "./enrichers/csWinPanelRound.js";
import type { MatchEndConditionsEvent } from "./enrichers/matchEndConditions.js";
import type { RoundMvpEvent } from "./enrichers/roundMvp.js";

/**
 * Tier-1 enriched event map.
 *
 * Keys are the raw CS:GO wire event names as they appear in the
 * `CSVCMsg_GameEventList` descriptor (e.g. `"player_death"`, `"bomb_planted"`).
 * Payloads are rich interfaces with resolved `Player` references.
 *
 * Exception: `chatMessage` is camelCase because it is emitted via the
 * user-message decoder path, not the game-event enricher dispatch.
 */
export interface Tier1EventMap {
  // Bomb lifecycle (TASK-039) — alphabetical by wire name
  bomb_abortdefuse: BombAbortDefuseEvent;
  bomb_abortplant: BombAbortPlantEvent;
  bomb_begindefuse: BombBeginDefuseEvent;
  bomb_beginplant: BombBeginPlantEvent;
  bomb_defused: BombDefusedEvent;
  bomb_dropped: BombDroppedEvent;
  bomb_exploded: BombExplodedEvent;
  bomb_pickup: BombPickedUpEvent;
  bomb_planted: BombPlantedEvent;
  // Combat & player actions (TASK-038) — alphabetical by wire name
  bullet_impact: BulletImpactEvent;
  other_death: OtherDeathEvent;
  player_blind: PlayerBlindEvent;
  player_death: PlayerDeathEvent;
  player_given_c4: PlayerGivenC4Event;
  player_hurt: PlayerHurtEvent;
  player_spawn: PlayerSpawnedEvent;
  // Grenade lifecycle (TASK-041) — alphabetical by wire name
  decoy_detonate: DecoyDetonateEvent;
  flashbang_detonate: FlashbangDetonateEvent;
  grenade_bounce: GrenadeBounceEvent;
  grenade_thrown: GrenadeThrownEvent;
  hegrenade_detonate: HeGrenadeDetonateEvent;
  // Hostage events (TASK-045) — alphabetical by wire name
  hostage_follows: HostagePickedUpEvent;
  hostage_hurt: HostageHurtEvent;
  hostage_rescued: HostageRescuedEvent;
  inferno_expire: InfernoExpiredEvent;
  // Item lifecycle (TASK-043) — alphabetical by wire name
  item_equip: ItemEquipEvent;
  item_pickup: ItemPickupEvent;
  item_purchase: ItemPurchaseEvent;
  molotov_detonate: MolotovDetonateEvent;
  smokegrenade_detonate: SmokeGrenadeDetonateEvent;
  smokegrenade_expired: SmokeGrenadeExpiredEvent;
  // Player connection lifecycle (TASK-042) — alphabetical by wire name
  player_connect: PlayerConnectEvent;
  player_disconnect: PlayerDisconnectEvent;
  player_team: PlayerTeamChangeEvent;
  // Round lifecycle (TASK-040) — alphabetical by wire name
  round_end: RoundEndEvent;
  round_freeze_end: RoundFreezeEndEvent;
  round_poststart: RoundPoststartEvent;
  round_prestart: RoundPrestartEvent;
  round_start: RoundStartEvent;
  // Weapon events (TASK-044) — alphabetical by wire name
  weapon_fire: WeaponFireEvent;
  weapon_reload: WeaponReloadEvent;
  weapon_zoom: WeaponZoomEvent;
  // Miscellaneous match-state events (TASK-046) — alphabetical by wire name
  announce_phase_end: AnnouncePhaseEndEvent;
  begin_new_match: BeginNewMatchEvent;
  bot_takeover: BotTakeoverEvent;
  cs_win_panel_match: CsWinPanelMatchEvent;
  cs_win_panel_round: CsWinPanelRoundEvent;
  match_end_conditions: MatchEndConditionsEvent;
  round_mvp: RoundMvpEvent;
  // Chat / user-message (TASK-047) — camelCase: emitted via user-message
  // decoder path, not the game-event enricher dispatch.
  chatMessage: ChatMessage;
}

/**
 * Tier-2 raw typed catch-all event map.
 *
 * `gameEvent` fires for every CS:GO game event on the wire (169+ total),
 * including events that have no Tier-1 enricher. The payload is a
 * self-describing record whose field names and types mirror the demo's
 * `CSVCMsg_GameEventList` descriptor schema.
 *
 * Tier-2 fires BEFORE Tier-1 for the same event, so a subscriber to both
 * sees the raw payload first.
 */
export interface Tier2EventMap {
  gameEvent: DecodedGameEvent;
}

/**
 * Tier-3 parser-synthetic event map.
 *
 * These events are emitted by the parser's own machinery — entity lifecycle,
 * string-table mutations, server info, descriptor-table availability, and
 * round-phase transitions. They have no entry in the CS:GO game-event
 * descriptor table.
 */
export interface Tier3EventMap {
  /** Emitted when the round phase transitions (warmup/freeze/live/over). */
  roundStateChanged: RoundStateChange;
  /** Emitted when the `CSVCMsg_ServerInfo` signon message is decoded. */
  serverInfo: CSVCMsg_ServerInfo;
  /** Emitted when a new string table is created from `CSVCMsg_CreateStringTable`. */
  stringTableCreated: { name: string; table: StringTable };
  /** Emitted when a string table is updated from `CSVCMsg_UpdateStringTable`. */
  stringTableUpdated: { name: string; changedEntries: StringTableEntry[] };
  /**
   * Fires once per `dem_stringtables` snapshot frame encountered. The payload
   * is the fully-decoded snapshot — power users can inspect the tables /
   * entries directly without the StringTableManager. Wraps {@link
   * DecodedStringTableSnapshot}.
   */
  stringTableSnapshot: {
    readonly tick: number;
    readonly snapshot: DecodedStringTableSnapshot;
  };
  /** Emitted when an entity is created via `CSVCMsg_PacketEntities`. */
  entityCreated: Entity;
  /** Emitted when an entity is updated via `CSVCMsg_PacketEntities`. */
  entityUpdated: Entity;
  /** Emitted when an entity is deleted via `CSVCMsg_PacketEntities`. */
  entityDeleted: Entity;
  /**
   * Emitted when a `CSVCMsg_PacketEntities` message fails to decode.
   *
   * The payload is the caught exception — it may be an `Error`, a string,
   * or any other thrown value. Do NOT type your listener parameter as `Error`
   * without a runtime check.
   */
  entityDecodeError: unknown;
  /** Emitted when the `CSVCMsg_GameEventList` descriptor table is ready. */
  gameEventListReady: EventDescriptorTable;
  /** Emitted when a `CSVCMsg_GameEvent` refers to an unknown event id. */
  gameEventDecodeError: { eventId: number };
  /**
   * Emitted when a Tier-1 enricher returns `null` for a known event, meaning
   * required fields (e.g. `userid`) could not be resolved. The Tier-2
   * `gameEvent` has already fired for this event.
   */
  gameEventEnrichmentSkipped: { name: string; eventId: number };
  /**
   * Emitted when the protobuf message dispatcher encounters a command id
   * that is not in its registry — i.e., a forward-compat or unimplemented
   * NETMessages / SVCMessages variant. Different CS:GO build numbers ship
   * different message tables, so this is expected on a long-running parser
   * and is NOT fatal: the dispatcher reads the size-prefixed payload, hands
   * it to listeners verbatim, and continues with the next message.
   *
   * Silent by default — no listener subscribed means the event is simply
   * dropped, matching the dispatcher's "skip and continue" policy. Subscribe
   * here only if you need to inspect raw bytes for unknown variants (e.g.
   * to reverse-engineer a new message type or to gate analytics on the
   * presence of a specific id). The `payload` is the exact slice taken from
   * the wire — no copy, no decoding, no schema applied.
   *
   * `tick` is the parser's `currentTick` at the moment the message was
   * dispatched, so listeners can correlate the unknown message with the
   * surrounding game state.
   */
  unknownMessage: {
    readonly commandId: number;
    readonly payload: Uint8Array;
    readonly tick: number;
  };
  /**
   * Fires for every `dem_consolecmd` frame encountered during the parse —
   * recorded console commands such as cvars, aliases, and rcon commands
   * issued by players or the server. The payload is the raw ASCII string
   * captured at record time; a single trailing `\0` (when CSGO null-
   * terminates the buffer) is stripped, but no other normalisation is
   * applied. `tick` is the frame's tick — typically equal to
   * `parser.currentTick` at emission time, but observe it from the payload
   * to be safe.
   *
   * Console commands are rare on competitive demos (which are recorded
   * server-side and typically have no client console activity) and far
   * more common on POV demos and lobby/casual recordings. A subscriber
   * may legitimately observe zero events on a given fixture.
   */
  consoleCommand: {
    readonly tick: number;
    readonly command: string;
  };
  /**
   * Recoverable parse failure (TASK-059). Fires when the parser encounters
   * truncated data, an invalid frame command byte, a corrupt protobuf
   * payload, a malformed string-table blob, or any other condition that
   * prevents progress past the current frame/message but does NOT compromise
   * the overall parse contract. After emitting, `parseAll()` returns cleanly
   * — it never throws on malformed input.
   *
   * `kind` discriminates the failure category for power users that want
   * different recovery behaviour. `tick` is `parser.currentTick` at the
   * point of failure (may be `-1` or `0` if failure occurred before the
   * first frame). `byteOffset` is the absolute byte offset into the input
   * buffer where the failing read began. `message` is a human-readable
   * description. `cause` is the original `Error` for stack-trace inspection.
   *
   * Recovery semantics by kind:
   *   - `truncated`            — fatal for the parse; loop terminates.
   *   - `invalid-frame`        — fatal; the wire stream cannot be re-synced
   *                              once a frame header is misaligned.
   *   - `corrupt-protobuf`     — recoverable; the dispatcher swallows the
   *                              single message and continues with the next.
   *   - `corrupt-stringtable`  — recoverable; one missing/partial table
   *                              does not invalidate subsequent frames.
   *   - `other`                — fatal by default; treat as terminate.
   */
  parserError: {
    readonly kind:
      | "truncated"
      | "invalid-frame"
      | "corrupt-protobuf"
      | "corrupt-stringtable"
      | "other";
    readonly tick: number;
    readonly byteOffset: number;
    readonly message: string;
    readonly cause: Error;
  };
}

/**
 * Complete TypeScript event map for {@link DemoParser}.
 *
 * Intersects all three tiers so `parser.on(...)` resolves the correct payload
 * type for every event name — from the enriched `player_death` (Tier 1)
 * through the raw-catch-all `gameEvent` (Tier 2) to parser-internal
 * `entityCreated` (Tier 3).
 */
export type ParserEventMap = Tier1EventMap & Tier2EventMap & Tier3EventMap;
