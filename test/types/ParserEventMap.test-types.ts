/**
 * Compile-only type tests for ParserEventMap (TASK-048).
 *
 * No runtime assertions. This file must compile cleanly under
 * `npm run typecheck` (which runs `tsc --noEmit -p tsconfig.test.json`).
 * A wrong type mapping produces a compile error — not a test failure.
 *
 * Anti-regression: if a future contributor renames a Tier-1 key from the
 * raw wire name (e.g. `bomb_pickup`) to camelCase, the assertions below fail
 * to compile, catching the breaking change before it ships.
 */
import type {
  DemoParser,
  ParserEventMap,
  PlayerDeathEvent,
  DecodedGameEvent,
  BombPickedUpEvent,
  RoundEndEvent,
  PlayerConnectEvent,
  ChatMessage,
} from "../../src/index.js";
import type {
  Tier1EventMap,
  Tier2EventMap,
  Tier3EventMap,
} from "../../src/events/index.js";
import type { Entity } from "../../src/entities/Entity.js";
import type { StringTable } from "../../src/stringtables/StringTable.js";
import type { StringTableEntry } from "../../src/stringtables/StringTable.js";
import type { RoundStateChange } from "../../src/state/RoundTracker.js";
import type { EventDescriptorTable } from "../../src/events/EventDescriptorTable.js";
import type { CSVCMsg_ServerInfo } from "../../src/proto/index.js";

// ---------------------------------------------------------------------------
// Hand-rolled type equality helper (conditional-type distributivity trick).
// Equals<A, B> is `true` only when A and B are mutually assignable in both
// directions. A type assertion `const _: Equals<A, B> = true` fails to
// compile when A and B differ.
// ---------------------------------------------------------------------------
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// ---------------------------------------------------------------------------
// Tier-1 assertions: raw wire names -> enriched event types.
// ---------------------------------------------------------------------------

// player_death -> PlayerDeathEvent (wire name, not camelCase)
const _t1PlayerDeath: Equals<Tier1EventMap["player_death"], PlayerDeathEvent> = true;

// bomb_pickup -> BombPickedUpEvent (anti-regression: must NOT be "bombPickup")
const _t1BombPickup: Equals<Tier1EventMap["bomb_pickup"], BombPickedUpEvent> = true;

// round_end -> RoundEndEvent
const _t1RoundEnd: Equals<Tier1EventMap["round_end"], RoundEndEvent> = true;

// player_connect -> PlayerConnectEvent
const _t1PlayerConnect: Equals<Tier1EventMap["player_connect"], PlayerConnectEvent> = true;

// chatMessage (camelCase — the one exception: user-message path, not wire name)
const _t1ChatMessage: Equals<Tier1EventMap["chatMessage"], ChatMessage> = true;

// ---------------------------------------------------------------------------
// Tier-2 assertion: gameEvent -> DecodedGameEvent
// ---------------------------------------------------------------------------
const _t2GameEvent: Equals<Tier2EventMap["gameEvent"], DecodedGameEvent> = true;

// ---------------------------------------------------------------------------
// Tier-3 assertions: parser-synthetic events.
// ---------------------------------------------------------------------------
const _t3RoundStateChanged: Equals<Tier3EventMap["roundStateChanged"], RoundStateChange> = true;
const _t3ServerInfo: Equals<Tier3EventMap["serverInfo"], CSVCMsg_ServerInfo> = true;
const _t3StringTableCreated: Equals<
  Tier3EventMap["stringTableCreated"],
  { name: string; table: StringTable }
> = true;
const _t3StringTableUpdated: Equals<
  Tier3EventMap["stringTableUpdated"],
  { name: string; changedEntries: StringTableEntry[] }
> = true;
const _t3EntityCreated: Equals<Tier3EventMap["entityCreated"], Entity> = true;
const _t3EntityUpdated: Equals<Tier3EventMap["entityUpdated"], Entity> = true;
const _t3EntityDeleted: Equals<Tier3EventMap["entityDeleted"], Entity> = true;
const _t3EntityDecodeError: Equals<Tier3EventMap["entityDecodeError"], unknown> = true;
const _t3GameEventListReady: Equals<Tier3EventMap["gameEventListReady"], EventDescriptorTable> = true;
const _t3GameEventDecodeError: Equals<
  Tier3EventMap["gameEventDecodeError"],
  { eventId: number }
> = true;
const _t3EnrichmentSkipped: Equals<
  Tier3EventMap["gameEventEnrichmentSkipped"],
  { name: string; eventId: number }
> = true;

// ---------------------------------------------------------------------------
// ParserEventMap is the intersection of all three tiers.
// ---------------------------------------------------------------------------
const _mapPlayerDeath: Equals<ParserEventMap["player_death"], PlayerDeathEvent> = true;
const _mapGameEvent: Equals<ParserEventMap["gameEvent"], DecodedGameEvent> = true;
const _mapEntityCreated: Equals<ParserEventMap["entityCreated"], Entity> = true;

// ---------------------------------------------------------------------------
// DemoParser.on() inference: verify listener param is correctly inferred.
// ---------------------------------------------------------------------------
declare const parser: DemoParser;

// Tier-1: player_death -> PlayerDeathEvent (wire name)
parser.on("player_death", (e) => {
  const typed: PlayerDeathEvent = e;
  void typed;
});

// Tier-1 anti-regression: bomb_pickup must use wire name, not camelCase
parser.on("bomb_pickup", (e) => {
  const typed: BombPickedUpEvent = e;
  void typed;
});

// Tier-2: gameEvent -> DecodedGameEvent
parser.on("gameEvent", (e) => {
  const typed: DecodedGameEvent = e;
  void typed;
});

// Tier-3: entityCreated -> Entity
parser.on("entityCreated", (e) => {
  const typed: Entity = e;
  void typed;
});

// Tier-3: roundStateChanged -> RoundStateChange
parser.on("roundStateChanged", (e) => {
  const typed: RoundStateChange = e;
  void typed;
});

// Tier-3: serverInfo -> CSVCMsg_ServerInfo
parser.on("serverInfo", (e) => {
  const typed: CSVCMsg_ServerInfo = e;
  void typed;
});

// Suppress "declared but unused" errors on assertion constants.
void _t1PlayerDeath;
void _t1BombPickup;
void _t1RoundEnd;
void _t1PlayerConnect;
void _t1ChatMessage;
void _t2GameEvent;
void _t3RoundStateChanged;
void _t3ServerInfo;
void _t3StringTableCreated;
void _t3StringTableUpdated;
void _t3EntityCreated;
void _t3EntityUpdated;
void _t3EntityDeleted;
void _t3EntityDecodeError;
void _t3GameEventListReady;
void _t3GameEventDecodeError;
void _t3EnrichmentSkipped;
void _mapPlayerDeath;
void _mapGameEvent;
void _mapEntityCreated;
