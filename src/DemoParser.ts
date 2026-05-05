/**
 * DemoParser — main public API for parsing CS:GO .dem files.
 *
 * This is the entry point for consumers of the library. It accepts a Buffer
 * containing the raw .dem file data and emits typed events as it parses
 * through frames, packets, entities, and game state.
 *
 * Architecture: The parser is a pipeline of layers, each feeding the next:
 *   ByteReader -> FrameParser -> PacketDecoder -> DataTables/Entities -> GameState -> Events
 *
 * Three ways to create a parser:
 *   - new DemoParser(buffer)        — from an existing Buffer
 *   - DemoParser.fromBuffer(buffer) — same, explicit factory
 *   - DemoParser.fromFile(path)     — read a .dem file from disk
 *
 * One-shot convenience:
 *   - DemoParser.parse(buffer)      — create + parseAll in one call
 *
 * Event emission: extends Node.js EventEmitter. Currently emits:
 *   - 'serverInfo' — when CSVCMsg_ServerInfo is decoded (decoded by ts-proto
 *                    via the MessageDispatcher; payload is the generated
 *                    CSVCMsg_ServerInfo type).
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Readable } from "node:stream";
import { TypedEventEmitter } from "./events/TypedEventEmitter.js";
import type { ParserEventMap, Tier1EventMap } from "./events/ParserEventMap.js";
import { ByteReader } from "./reader/ByteReader.js";
import { BitReader } from "./reader/BitReader.js";
import { parseHeader } from "./frame/header.js";
import type { DemoHeader } from "./frame/header.js";
import { iterateFrames } from "./frame/FrameParser.js";
import type { Frame } from "./frame/FrameParser.js";
import { MessageDispatcher } from "./packet/MessageDispatch.js";
import type {
  CSVCMsg_CreateStringTable,
  CSVCMsg_GameEvent,
  CSVCMsg_GameEventList,
  CSVCMsg_PacketEntities,
  CSVCMsg_ServerInfo,
  CSVCMsg_UpdateStringTable,
  CSVCMsg_UserMessage,
  CSVCMsg_VoiceData,
} from "./proto/index.js";
import { parseDataTables } from "./datatables/DataTablesParser.js";
import type { SendTableRegistry } from "./datatables/SendTableRegistry.js";
import { ServerClassRegistry } from "./datatables/ServerClassRegistry.js";
import { StringTable } from "./stringtables/StringTable.js";
import type { StringTableEntry } from "./stringtables/StringTable.js";
import { StringTableManager } from "./stringtables/StringTableManager.js";
import { PrecacheTable } from "./stringtables/precache.js";
import { parseStringTableEntries } from "./stringtables/StringTableParser.js";
import { decompressSnappy } from "./stringtables/Compression.js";
import { parseStringTableSnapshot } from "./stringtables/SnapshotParser.js";
import type { DecodedSnapshotTable } from "./stringtables/SnapshotParser.js";
import { EntityList, decodePacketEntities } from "./entities/index.js";
import { buildServerInfo } from "./state/ServerInfo.js";
import type { TypedServerInfo } from "./state/ServerInfo.js";
import { Player } from "./state/Player.js";
import { Weapon } from "./state/Weapon.js";
import { Team } from "./state/Team.js";
import { GameRules } from "./state/GameRules.js";
import { PlayerResource } from "./state/PlayerResource.js";
import { RoundTracker } from "./state/RoundTracker.js";
import type { RoundStateChange } from "./state/RoundTracker.js";
import { UserInfoIndex } from "./state/userInfoIndex.js";
import { buildDescriptorTable } from "./events/EventDescriptorTable.js";
import type { EventDescriptorTable } from "./events/EventDescriptorTable.js";
import { decodeGameEvent } from "./events/GameEventDecoder.js";
import { enricherTable } from "./events/enrichers/index.js";
import { buildEnricherContext } from "./events/EnricherContext.js";
import { decodeChatMessage } from "./events/UserMessageDecoder.js";
import type { ChatMessage, ChatMessageContext } from "./events/UserMessageDecoder.js";
import type { DecodedGameEvent } from "./events/GameEventDecoder.js";
import type { PlayerDeathEvent } from "./events/enrichers/playerDeath.js";
import type { GrenadeThrownEvent } from "./events/enrichers/grenadeThrown.js";
import type { DemoResult, ParseOptions } from "./convenience/DemoResult.js";
import { ConvenienceRoundTracker } from "./convenience/RoundTracker.js";
import { DamageMatrix } from "./convenience/DamageMatrix.js";
import { EconomyTracker } from "./convenience/EconomyTracker.js";
import type { PlayerRoundEconomy } from "./convenience/EconomyTracker.js";
import { PositionTracker } from "./convenience/PositionTracker.js";
import type { PositionSnapshot } from "./convenience/PositionTracker.js";
import { GrenadeTrajectoryTracker } from "./convenience/GrenadeTrajectoryTracker.js";

export class DemoParser extends TypedEventEmitter<ParserEventMap> {
  private readonly buffer: Buffer;
  private _header: DemoHeader | undefined;
  private _serverInfo: CSVCMsg_ServerInfo | undefined;
  private _sendTables: SendTableRegistry | undefined;
  private _serverClasses: ServerClassRegistry | undefined;
  private _stringTables: StringTableManager | undefined;
  /** Per-table-id history rings, keyed by table id. UpdateStringTable
   * continues the same ring its corresponding CreateStringTable used. */
  private readonly stringTableHistories = new Map<number, string[]>();
  /** Live entity list, populated as PacketEntities messages are decoded. */
  private readonly _entities: EntityList = new EntityList();
  /**
   * Memoized typed ServerInfo overlay (TASK-035). Lazily built on first
   * access of `serverInfoState`. Both source values (`_serverInfo` and
   * `_header`) are frozen post-`parseAll`, so a single build is correct
   * for the lifetime of the parser. `null` means "not yet built";
   * `undefined` is reserved for the legitimate "raw ServerInfo not yet
   * decoded" return value the getter exposes.
   */
  private _typedServerInfo: TypedServerInfo | undefined | null = null;
  /**
   * Memoized typed overlays (M3). Each is built lazily on first access by
   * walking `this._entities` and filtering by ServerClass shape. `null`
   * means "not yet computed". Cache invalidation is intentionally skipped
   * for v0.1 — held overlays whose entity has been recycled will throw
   * `StaleEntityError` on read (per ADR-004), which is the right loudness.
   */
  private _playersCache: Player[] | null = null;
  private _weaponsCache: Weapon[] | null = null;
  private _teamsCache: Team[] | null = null;
  /**
   * Memoized `GameRules` overlay. `null` means "not yet computed";
   * `undefined` (after a build attempt) means "no CCSGameRulesProxy entity
   * exists yet" — distinct from the not-yet-tried sentinel so we keep
   * retrying on each access until the proxy entity is created. Once built
   * it sticks for the parser's lifetime.
   */
  private _gameRulesCache: GameRules | undefined | null = null;
  /**
   * Memoized `PlayerResource` overlay (TASK-029a). Same lifecycle as
   * `_gameRulesCache`: `null` is "not yet computed", `undefined` (after a
   * build attempt) is "no CCSPlayerResource entity yet — keep retrying".
   * The CCSPlayerResource entity is a singleton created once during the
   * server's spawn sequence and persists for the demo's lifetime, so once
   * the overlay is built it sticks for the parser's lifetime.
   */
  private _playerResourceCache: PlayerResource | undefined | null = null;
  /**
   * Round-phase tracker (TASK-034). Owned by the parser; subscribed to the
   * `CCSGameRulesProxy` entity's create/update events from inside the
   * PacketEntities decode hook. The tracker is constructed eagerly so the
   * `roundTracker` accessor never returns `undefined` and listeners attached
   * before `parseAll()` start receiving emissions on the very first proxy
   * tick. The emit callback bridges to the parser-level `roundStateChanged`
   * typed event — the tracker stays pure and embedder-agnostic, the parser
   * owns the EventEmitter.
   */
  private readonly _roundTracker: RoundTracker = new RoundTracker((change: RoundStateChange) =>
    this.emit("roundStateChanged", change),
  );
  /**
   * Game-event descriptor table (TASK-036). Built once when
   * `CSVCMsg_GameEventList` arrives during signon. `undefined` until that
   * message has been observed; the GameEvent decoder (TASK-037) reads this
   * synchronously to interpret each `CSVCMsg_GameEvent` payload.
   */
  private _eventDescriptors: EventDescriptorTable | undefined;
  /**
   * `userid -> entitySlot` resolver (TASK-037b). Built lazily on first
   * access of `userInfoIndex`. Stays live across the parse: every time
   * the `userinfo` string-table changes (CreateStringTable or
   * UpdateStringTable), the index is `refresh()`-ed so Tier-1 enrichers
   * always see the current player roster. `null` is the not-yet-built
   * sentinel — once instantiated the same instance sticks for the
   * parser's lifetime.
   */
  private _userInfoIndex: UserInfoIndex | null = null;
  /**
   * Memoized {@link PrecacheTable} wrappers for the three Source precache
   * string tables (TASK-052/053/054). Each wrapper holds the
   * `StringTableManager` by reference, so a single instance per accessor
   * stays correct for the parser's lifetime — entries added to the
   * underlying table after construction are visible on subsequent reads
   * without re-instantiation. `null` is the not-yet-built sentinel.
   */
  private _modelPrecache: PrecacheTable | null = null;
  private _soundPrecache: PrecacheTable | null = null;
  private _downloadables: PrecacheTable | null = null;

  constructor(buffer: Buffer) {
    super();
    this.buffer = buffer;
  }

  /** The parsed demo header. Available after parseAll() completes. */
  get header(): DemoHeader | undefined {
    return this._header;
  }

  /**
   * The latest decoded `CSVCMsg_ServerInfo` message.
   *
   * `undefined` until parsing reaches the signon phase — i.e., before
   * `parseAll()` is invoked or before the first packet/signon frame
   * carrying a ServerInfo message is processed. Later parsing stages
   * (entity system, etc.) read this synchronously without subscribing
   * to the `serverInfo` event. Synchronous `serverInfo` event listeners
   * observe a consistent state: this property is assigned before the
   * event is emitted.
   */
  get serverInfo(): CSVCMsg_ServerInfo | undefined {
    return this._serverInfo;
  }

  /**
   * Typed roll-up of the demo header and `CSVCMsg_ServerInfo` packet —
   * see {@link TypedServerInfo}. Joins map name, tick interval, max
   * classes, computed `tickRate`, header playback duration / ticks, and
   * the `isGOTV` flag into a single read-only object.
   *
   * Returns `undefined` until both the header and the `CSVCMsg_ServerInfo`
   * packet have been observed (i.e., before the first `serverInfo` event
   * fires). Lazily built on first access and memoized — both source
   * values are immutable for the rest of the parser's lifetime.
   */
  get serverInfoState(): TypedServerInfo | undefined {
    if (this._typedServerInfo !== null) return this._typedServerInfo;
    if (this._header === undefined) return undefined;
    const built = buildServerInfo(this._serverInfo, this._header);
    if (built === undefined) {
      // Don't memoize "not yet decoded" — keep retrying on each access
      // until the underlying ServerInfo arrives. Once built it sticks.
      return undefined;
    }
    this._typedServerInfo = built;
    return built;
  }

  /**
   * Live `Player` overlays for every CCSPlayer entity currently in the
   * entity list. Built lazily on first access by walking
   * `this._entities.entries()` and filtering by `serverClass.className ===
   * "CCSPlayer"`. Each overlay is a *live view* (ADR-004): subsequent reads
   * through `player.position`, `player.health`, etc. observe the latest
   * tick's value automatically. The slot passed to the `Player` constructor
   * is the entity id, which on CCSPlayer is the player's 1-based connection
   * slot in the standard Source convention.
   *
   * The returned array is memoized — repeat calls return the same reference
   * for v0.1. Cache invalidation on disconnect is deferred; held references
   * to disconnected players surface the `StaleEntityError` from the
   * underlying `Entity.assertFresh`, which is the right loudness.
   */
  get players(): Player[] {
    if (this._playersCache !== null) return this._playersCache;
    const userInfoIndex = this.userInfoIndex;
    const out: Player[] = [];
    for (const [id, entity] of this._entities.entries()) {
      if (entity.serverClass.className === "CCSPlayer") {
        out.push(new Player(id, entity, userInfoIndex));
      }
    }
    this._playersCache = out;
    return out;
  }

  /**
   * Live `Weapon` overlays for every weapon entity currently in the entity
   * list. Filter heuristic: any entity whose ServerClass exposes
   * `m_iClip1` in its flattened-prop schema is a weapon. This is a
   * structural check — it sidesteps the long enumeration of CWeapon*
   * subclasses and stays correct as new guns are added in CSGO updates.
   */
  get weapons(): Weapon[] {
    if (this._weaponsCache !== null) return this._weaponsCache;
    const out: Weapon[] = [];
    for (const [, entity] of this._entities.entries()) {
      const hasClip1 = entity.serverClass.flattenedProps.some((p) => p.prop.varName === "m_iClip1");
      if (hasClip1) {
        out.push(new Weapon(entity));
      }
    }
    this._weaponsCache = out;
    return out;
  }

  /**
   * Live `Team` overlays for every CCSTeam entity currently in the entity
   * list. CS:GO networks one CCSTeam per side — Unassigned, Spectator, T,
   * CT — so on a well-formed demo this returns four entries. Each overlay
   * is a *live view* (ADR-004): subsequent reads through `team.score`,
   * `team.name`, etc. observe the latest tick's value automatically.
   *
   * The returned array is memoized — repeat calls return the same reference
   * for v0.1. Cache invalidation on team-entity churn is deferred; CCSTeam
   * entities are stable for the duration of a match so this is a non-issue
   * in practice.
   */
  get teams(): Team[] {
    if (this._teamsCache !== null) return this._teamsCache;
    const out: Team[] = [];
    for (const [, entity] of this._entities.entries()) {
      if (entity.serverClass.className === "CCSTeam") {
        out.push(new Team(entity));
      }
    }
    this._teamsCache = out;
    return out;
  }

  /**
   * Live `GameRules` overlay (TASK-033) over the singleton
   * `CCSGameRulesProxy` entity. The proxy is created early in the demo's
   * signon sequence and persists for the full parse — there's exactly one
   * per demo, so this returns a single overlay (or `undefined` if the
   * proxy hasn't been observed yet, e.g. mid-parse before signon
   * completes).
   *
   * Each overlay is a *live view* (ADR-004): subsequent reads through
   * `gameRules.roundTime`, `gameRules.isWarmup`, etc. observe the latest
   * tick's value automatically. The result is memoized once the proxy
   * entity is found; until then the getter keeps retrying so a caller
   * holding a parser reference picks up the overlay as soon as the proxy
   * appears in the entity list.
   */
  get gameRules(): GameRules | undefined {
    if (this._gameRulesCache !== null) return this._gameRulesCache;
    for (const [, entity] of this._entities.entries()) {
      if (entity.serverClass.className === "CCSGameRulesProxy") {
        const built = new GameRules(entity);
        this._gameRulesCache = built;
        return built;
      }
    }
    // Don't memoize "not yet observed" — retry each access until the
    // proxy entity arrives. Once built (above) the cache sticks.
    return undefined;
  }

  /**
   * Live `PlayerResource` overlay (TASK-029a) over the singleton
   * `CCSPlayerResource` entity. CCSPlayerResource carries per-player-slot
   * stat arrays (kills/deaths/assists/score/ping for slots 0..63) — read
   * them via `playerResource.killsForSlot(slot)` and friends, or
   * `playerResource.snapshot()` for a frozen point-in-time copy.
   *
   * Returns `undefined` until the singleton entity has been observed (early
   * signon on a well-formed demo). Each overlay is a *live view* (ADR-004):
   * subsequent reads observe the latest tick's value. The result is
   * memoized once the entity is found; until then the getter keeps
   * retrying so a caller holding a parser reference picks up the overlay
   * as soon as the entity appears in the entity list.
   */
  get playerResource(): PlayerResource | undefined {
    if (this._playerResourceCache !== null) return this._playerResourceCache;
    for (const [, entity] of this._entities.entries()) {
      if (entity.serverClass.className === "CCSPlayerResource") {
        const built = new PlayerResource(entity);
        this._playerResourceCache = built;
        return built;
      }
    }
    // Don't memoize "not yet observed" — retry each access until the
    // entity arrives. Once built (above) the cache sticks.
    return undefined;
  }

  /**
   * Round-phase tracker (TASK-034) — derives the `warmup`/`freeze`/`live`/
   * `over` round phase from `GameRules` updates and emits the
   * `roundStateChanged` parser event on every transition. The tracker is
   * always non-null; before the first `CCSGameRulesProxy` tick its `phase`
   * getter returns `undefined`. Use this getter to inspect the latest phase
   * synchronously, or subscribe to the `roundStateChanged` event to stream
   * transitions as they fire.
   */
  get roundTracker(): RoundTracker {
    return this._roundTracker;
  }

  /**
   * Current frame tick. Updated per-frame inside `parseAll()` before game
   * events for that frame are dispatched. Tier-1 enriched event listeners
   * always observe the tick of the frame that triggered the event.
   *
   * `0` before `parseAll()` begins or when called outside an active parse.
   */
  get currentTick(): number {
    return this._currentTick;
  }

  /**
   * The SendTable registry parsed from the demo's `dem_datatables` frame.
   *
   * `undefined` until parsing reaches the signon datatables frame. After
   * `parseAll()` completes on a well-formed demo this is always populated;
   * the entity decoder (M2 Slice 4) reads it synchronously.
   */
  get sendTables(): SendTableRegistry | undefined {
    return this._sendTables;
  }

  /**
   * The ServerClass registry parsed from the demo's `dem_datatables` frame.
   *
   * `undefined` until parsing reaches the signon datatables frame. Indexed
   * by both `classId` and C++ `className`.
   */
  get serverClasses(): ServerClassRegistry | undefined {
    return this._serverClasses;
  }

  /**
   * The string-table manager. `undefined` until the first
   * CSVCMsg_CreateStringTable arrives (early in signon). Once any
   * CreateStringTable is processed, this is populated for the rest of
   * parsing. Indexed by both name and wire id.
   */
  get stringTables(): StringTableManager | undefined {
    return this._stringTables;
  }

  /**
   * The live entity list, populated as `svc_PacketEntities` messages are
   * decoded. Empty until parsing reaches the first PacketEntities message
   * (post-datatables / post-stringtables). After `parseAll()` returns on a
   * well-formed demo this contains every entity that survived to dem_stop.
   */
  get entities(): EntityList {
    return this._entities;
  }

  /**
   * Game-event descriptor table parsed from the demo's `CSVCMsg_GameEventList`
   * signon message (TASK-036). `undefined` until that message has been
   * observed during `parseAll()`; on a well-formed CS:GO demo it is populated
   * with 100+ descriptors (CS:GO networks 169+ events) early in signon and
   * remains stable for the rest of the parse.
   *
   * Each entry maps an event id to its name plus the schema (key name + wire
   * type) of every value carried by an instance of that event. The GameEvent
   * decoder (TASK-037) reads this synchronously; the public Tier-2 catch-all
   * `gameEvent` (TASK-048) surfaces it to user code.
   */
  get gameEventDescriptors(): EventDescriptorTable | undefined {
    return this._eventDescriptors;
  }

  /**
   * Current frame tick, updated on each frame processed during `parseAll()`.
   * Game events (and therefore Tier-1 enriched events) fire synchronously
   * inside the frame loop, so this always reflects the frame tick at the
   * moment any event listener runs. `0` before parsing begins.
   */
  private _currentTick = 0;

  /**
   * Byte offset into the input buffer where the most recent frame iteration
   * began (TASK-059). Captured BEFORE each `iterateFrames` step so that a
   * mid-frame throw — truncation, invalid command byte, or a corrupt
   * payload picked up during `dispatcher.dispatch(...)` — can be reported
   * with the offset of the failing read rather than the random offset the
   * reader happens to have advanced to. Reset to `0` at the start of
   * `parseAll()`; only meaningful while parsing is in progress.
   */
  private _lastFrameOffset = 0;

  /**
   * `userid -> entitySlot` / `userid -> UserInfo` resolver (TASK-037b),
   * the canonical decoder of the `userinfo` string-table's `player_info_t`
   * userdata blob. Per ADR-006 every Tier-1 event enricher routes its
   * `userid` field through this index — no enricher decodes
   * `player_info_t` directly.
   *
   * Built lazily on first access and refreshed whenever the underlying
   * `userinfo` string-table changes (during signon and on every
   * mid-demo player join/leave). The instance returned is stable for the
   * parser's lifetime; the maps inside it move as players reconnect.
   *
   * Always returns a non-null `UserInfoIndex`. Until the `userinfo` table
   * is created (very early in signon), every lookup returns `undefined`.
   */
  get userInfoIndex(): UserInfoIndex {
    if (this._userInfoIndex !== null) return this._userInfoIndex;
    // The `_stringTables` manager is created the moment the first
    // CreateStringTable arrives (very early in signon). On a well-formed
    // demo this is true before any consumer touches `userInfoIndex`. If
    // somehow accessed before that, we lazily create the manager so the
    // getter never returns null and so a single canonical manager exists
    // for the rest of the parse.
    if (this._stringTables === undefined) {
      this._stringTables = new StringTableManager();
    }
    const built = new UserInfoIndex(this._stringTables);
    built.refresh();
    this._userInfoIndex = built;
    return built;
  }

  /**
   * Live wrapper over the `modelprecache` string table (TASK-052).
   *
   * Resolves a model index — the integer carried by every entity's
   * `m_nModelIndex` prop — to its `models/...` file path. Use
   * `parser.modelPrecache.get(entity.props.m_nModelIndex)` to discover
   * what model an entity is currently using.
   *
   * Memoization is safe: `PrecacheTable` holds the
   * `StringTableManager` by reference, so a single wrapper instance per
   * accessor sees every subsequent CreateStringTable / UpdateStringTable
   * mutation. The wrapper is constructed lazily on first access so callers
   * who never read the precache pay nothing.
   *
   * Returns an empty wrapper (`size === 0`, `get` returns `undefined`)
   * before the underlying table has been observed.
   */
  get modelPrecache(): PrecacheTable {
    if (this._modelPrecache !== null) return this._modelPrecache;
    // Mirror `userInfoIndex`: ensure a single canonical manager exists
    // before binding the wrapper to it, so a pre-signon access doesn't
    // capture `undefined` permanently. The manager normally arrives the
    // moment the first CreateStringTable fires, but a defensive create
    // here means the wrapper stays live for every subsequent access.
    if (this._stringTables === undefined) {
      this._stringTables = new StringTableManager();
    }
    const built = new PrecacheTable(this._stringTables, "modelprecache");
    this._modelPrecache = built;
    return built;
  }

  /**
   * Live wrapper over the `soundprecache` string table (TASK-053).
   *
   * Resolves a sound index to its `sound/...` file path. Same liveness
   * and memoization semantics as {@link modelPrecache} — see that getter
   * for the rationale on caching a single instance.
   *
   * Returns an empty wrapper before the underlying table is created;
   * note that some demos register no soundprecache entries at all (the
   * server only precaches sounds it intends to network), in which case
   * `size` legitimately stays at `0` for the entire parse.
   */
  get soundPrecache(): PrecacheTable {
    if (this._soundPrecache !== null) return this._soundPrecache;
    if (this._stringTables === undefined) {
      this._stringTables = new StringTableManager();
    }
    const built = new PrecacheTable(this._stringTables, "soundprecache");
    this._soundPrecache = built;
    return built;
  }

  /**
   * Live wrapper over the `downloadables` string table (TASK-054).
   *
   * Lists arbitrary files the server requested clients download — custom
   * maps, sprays, mod content, sound packs, etc. Often empty on clean
   * competitive matches that ship only stock content; populated on
   * community / FaceIt / pug demos that pull in extra assets.
   *
   * Same liveness and memoization semantics as {@link modelPrecache}.
   */
  get downloadables(): PrecacheTable {
    if (this._downloadables !== null) return this._downloadables;
    if (this._stringTables === undefined) {
      this._stringTables = new StringTableManager();
    }
    const built = new PrecacheTable(this._stringTables, "downloadables");
    this._downloadables = built;
    return built;
  }

  /**
   * One-shot convenience: create a parser from a buffer and parse it immediately.
   *
   * @deprecated Use `DemoParser.parse(buffer)` (the async overload) instead.
   *   `parseSync` remains for synchronous contexts but the async `parse` is
   *   the preferred primary entry point as of v0.1.
   */
  static parseSync(buffer: Buffer): DemoParser {
    const parser = new DemoParser(buffer);
    parser.parseAll();
    return parser;
  }

  /**
   * High-level async convenience API (ADR-009). Accepts a file path (string)
   * or an in-memory Buffer, parses the entire demo, and returns a frozen
   * {@link DemoResult} with all events collected into typed arrays.
   *
   * When given a `string`, the file is read with `fs/promises.readFile`.
   * A single `setImmediate` yield after I/O (but before parse) keeps the
   * event loop responsive for callers that chain multiple `parse` calls.
   *
   * `options.includeRawEvents` (default `false`) opts into collecting every
   * raw `DecodedGameEvent`. Leave it off on competitive demos — the raw event
   * stream is large and callers rarely need it alongside the Tier-1 arrays.
   *
   * A Node `Readable` (e.g. `fs.createReadStream`, an `http.IncomingMessage`,
   * or any `Readable.from(...)` producer) is also accepted. The stream is
   * fully drained into a Buffer via {@link DemoParser.fromStream} before
   * parsing — see that method for the trade-off (TASK-071a vs. TASK-071's
   * future true-streaming work).
   */
  static async parse(
    input: string | Buffer | Readable,
    options: ParseOptions = {},
  ): Promise<DemoResult> {
    let buffer: Buffer;
    if (typeof input === "string") {
      buffer = await readFile(input);
    } else if (Buffer.isBuffer(input)) {
      buffer = input;
    } else {
      // Node `Readable` — drain to a Buffer. Duck-typed via `Symbol.asyncIterator`
      // through `fromStream` so any compliant async-iterable stream works
      // (http.IncomingMessage, fs.createReadStream, Readable.from, …).
      const streamParser = await DemoParser.fromStream(input);
      buffer = streamParser.buffer;
    }

    // Yield once so I/O-heavy callers don't starve the event loop between
    // sequential parse() calls. Negligible overhead (~0 ms) for single calls.
    await new Promise<void>((resolve) => setImmediate(resolve));

    const parser = new DemoParser(buffer);

    const kills: PlayerDeathEvent[] = [];
    const grenades: GrenadeThrownEvent[] = [];
    const chatMessages: ChatMessage[] = [];
    const events: DecodedGameEvent[] | undefined = options.includeRawEvents ? [] : undefined;

    parser.on("player_death", (e) => kills.push(e));
    parser.on("grenade_thrown", (e) => grenades.push(e));
    parser.on("chatMessage", (e) => chatMessages.push(e));
    if (events !== undefined) {
      parser.on("gameEvent", (e) => events.push(e));
    }

    const roundTracker = new ConvenienceRoundTracker();
    roundTracker.attach(parser);

    const damageMatrix = new DamageMatrix();
    damageMatrix.attach(parser);

    const economyTracker = new EconomyTracker();
    economyTracker.attach(parser);

    const grenadeTrajectoryTracker = new GrenadeTrajectoryTracker();
    grenadeTrajectoryTracker.attach(parser);

    // Position sampling is opt-in (ParseOptions.collectPlayerPositions).
    // When omitted/false the tracker is never instantiated — no entityUpdated
    // listener is registered, no per-tick sampling overhead is incurred, and
    // `DemoResult.playerPositions` is left `undefined`.
    let positionTracker: PositionTracker | undefined;
    if (options.collectPlayerPositions === true) {
      positionTracker = new PositionTracker();
      positionTracker.attach(parser, {
        sampleRateTicks: options.positionSampleRateTicks,
      });
    }

    parser.parseAll();

    const rounds = roundTracker.snapshot();

    // Decorate each RoundPlayerStats with the corresponding economy record.
    // The cast below is the ONLY place we sidestep the `readonly economy?`
    // constraint — `RoundPlayerStats.economy` is readonly in the public type
    // but the field is `undefined` at construction time and must be filled in
    // here during post-parse assembly. Using a cast avoids making the mutable
    // field visible in the public interface.
    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i];
      if (round === undefined) continue;
      for (const stats of round.players.values()) {
        const econ = economyTracker.getEconomy(i, stats.player.slot);
        if (econ !== undefined) {
          (stats as { economy?: PlayerRoundEconomy }).economy = econ;
        }
      }
    }

    const playerPositions: readonly PositionSnapshot[] | undefined =
      positionTracker?.snapshot();

    return Object.freeze({
      header: parser.header as DemoHeader,
      players: parser.players.map((p) => p.snapshot()),
      kills,
      rounds,
      grenades,
      grenadeTrajectories: grenadeTrajectoryTracker.snapshot(),
      chatMessages,
      events,
      damageMatrix,
      playerPositions,
    });
  }

  /**
   * Create a parser by reading a .dem file from disk.
   */
  static fromFile(path: string): DemoParser {
    const buffer = readFileSync(path);
    return new DemoParser(buffer);
  }

  /**
   * Create a parser from an existing Buffer (explicit factory alternative to constructor).
   */
  static fromBuffer(buffer: Buffer): DemoParser {
    return new DemoParser(buffer);
  }

  /**
   * Create a parser by draining a Node `Readable` stream (TASK-071a).
   *
   * Accepts any Node `Readable` — `fs.createReadStream(path)`, an
   * `http.IncomingMessage` from a download, an S3 SDK body stream, or a
   * synthetic `Readable.from([chunkA, chunkB, …])`. Chunks are collected via
   * `for await` (so any stream that implements `Symbol.asyncIterator` works),
   * normalized through `Buffer.from(chunk)` to coerce string chunks if the
   * stream happens to be in text mode, and concatenated exactly once at the
   * end before construction — minimal allocator churn, single contiguous
   * Buffer hand-off to the parser.
   *
   * Error propagation is automatic: if the underlying stream errors mid-read,
   * `for await` rethrows and the returned Promise rejects with the original
   * error. No special wiring is needed.
   *
   * Trade-off: the entire demo is buffered into memory before parsing begins.
   * For an HTTP download of a typical competitive demo (~50–150 MB) this is
   * negligible; for very large or memory-constrained environments it is a
   * known limitation. v1 deliberately does NOT do incremental / true-streaming
   * parse — that's tracked separately under TASK-071 (perf-tracked benchmarks
   * for the future streaming pipeline). The wire format does not support
   * streaming entity decode without first observing the signon-phase
   * datatables, so partial-buffer parsing is a non-trivial redesign rather
   * than a small extension.
   *
   * @example
   * ```ts
   * import { createReadStream } from "node:fs";
   * const parser = await DemoParser.fromStream(createReadStream("match.dem"));
   * parser.parseAll();
   * ```
   */
  static async fromStream(readable: Readable): Promise<DemoParser> {
    const chunks: Buffer[] = [];
    for await (const chunk of readable) {
      chunks.push(Buffer.from(chunk));
    }
    return new DemoParser(Buffer.concat(chunks));
  }

  /**
   * Parse the entire demo file synchronously, emitting events as they occur.
   *
   * Defensive parsing (TASK-059): malformed input never throws past this
   * boundary. Recoverable failures — truncated buffers, an invalid frame
   * command byte, ts-proto decode failures on a single message, corrupt
   * string-table blobs — are surfaced through the typed `parserError` event
   * and the parser either continues with the next message/frame (per-message
   * granularity) or returns cleanly (frame-level desync). The only thrown
   * error path is a hard precondition violation: `Empty demo file` when the
   * caller hands in a zero-byte buffer.
   */
  parseAll(): void {
    if (this.buffer.length === 0) {
      throw new Error("Empty demo file");
    }

    const reader = new ByteReader(this.buffer);
    this._header = parseHeader(reader);

    const dispatcher = new MessageDispatcher({
      onServerInfo: (info: CSVCMsg_ServerInfo) => {
        // Capture before emit so synchronous listeners that observe both
        // the event and the property see a consistent state.
        this._serverInfo = info;
        this.emit("serverInfo", info);
      },
      onCreateStringTable: (msg: CSVCMsg_CreateStringTable) => {
        // Surface string-table parse failures through `parserError` rather
        // than letting them bubble up and abort the whole demo. Losing a
        // single table (e.g. a corrupt `userinfo` snapshot) is local damage
        // — subsequent frames still produce useful entity / game-event data.
        try {
          this.handleCreateStringTable(msg);
        } catch (err) {
          this.emitParserError(
            "corrupt-stringtable",
            err,
            `CreateStringTable parse failed for "${msg.name ?? ""}"`,
            reader.position,
          );
        }
      },
      onUpdateStringTable: (msg: CSVCMsg_UpdateStringTable) => {
        try {
          this.handleUpdateStringTable(msg);
        } catch (err) {
          this.emitParserError(
            "corrupt-stringtable",
            err,
            `UpdateStringTable parse failed for table id ${msg.tableId ?? -1}`,
            reader.position,
          );
        }
      },
      onPacketEntities: (msg: CSVCMsg_PacketEntities) => {
        this.handlePacketEntities(msg);
      },
      onGameEventList: (msg: CSVCMsg_GameEventList) => {
        this.handleGameEventList(msg);
      },
      onGameEvent: (msg: CSVCMsg_GameEvent) => {
        this.handleGameEvent(msg);
      },
      onUserMessage: (msg: CSVCMsg_UserMessage) => {
        this.handleUserMessage(msg);
      },
      onVoiceData: (msg: CSVCMsg_VoiceData) => {
        this.handleVoiceData(msg);
      },
      onUnknownMessage: (commandId: number, payload: Uint8Array) => {
        // Forward-compat / unimplemented protobuf message variant. The
        // dispatcher already skipped the payload bytes; we surface the raw
        // (commandId, payload, tick) tuple as a typed event for power users
        // who need to inspect or reverse-engineer it. Silent if no listener.
        this.emit("unknownMessage", {
          commandId,
          payload,
          tick: this._currentTick,
        });
      },
      onDecodeError: (commandId: number, error: Error, _payload: Uint8Array) => {
        // ts-proto threw on a known command id's payload — corruption is
        // isolated to this single message. The dispatcher has already moved
        // past it; surface a `parserError` and continue with the next
        // message in the same packet. `byteOffset` is the frame's start
        // offset (we don't track per-message offsets — the dispatcher reads
        // from a private ByteReader over the packet payload), which is the
        // tightest locator available for the corruption.
        this.emitParserError(
          "corrupt-protobuf",
          error,
          `Protobuf decode failed for command id ${commandId}`,
          this._lastFrameOffset,
        );
      },
    });

    // Iterate frames defensively. `iterateFrames` is a generator that calls
    // `readFrame`; any throw inside that generator (RangeError on truncation,
    // "unknown command byte" on a corrupt frame header) propagates here. We
    // capture `reader.position` BEFORE each `next()` so a thrown failure
    // reports the offset where the failing read began.
    const frames = iterateFrames(reader);
    for (;;) {
      this._lastFrameOffset = reader.position;
      let next: IteratorResult<Frame>;
      try {
        next = frames.next();
      } catch (err) {
        const classified = classifyFrameError(err);
        this.emitParserError(
          classified.kind,
          err,
          classified.message,
          this._lastFrameOffset,
        );
        // A frame-header desync cannot be re-synced (we'd be guessing where
        // the next valid header begins). Both `truncated` and `invalid-frame`
        // terminate the parse cleanly.
        return;
      }
      if (next.done === true) return;
      const frame = next.value;
      // Update current tick before dispatching so event listeners always read
      // the correct frame tick when they access `parser.currentTick`.
      this._currentTick = frame.tick;
      try {
        if (frame.packetData) {
          dispatcher.dispatch(frame.packetData);
        }
        if (frame.dataTablesData !== undefined && this._sendTables === undefined) {
          const { sendTables, serverClasses } = parseDataTables(frame.dataTablesData);
          this._sendTables = sendTables;
          const registry = new ServerClassRegistry();
          for (const sc of serverClasses) {
            registry.register(sc);
          }
          this._serverClasses = registry;
        }
        if (frame.consoleCmdData !== undefined) {
          this.emit("consoleCommand", {
            tick: frame.tick,
            command: decodeConsoleCommand(frame.consoleCmdData),
          });
        }
        if (frame.userCmdData !== undefined) {
          // Surface the raw command-encoding blob as a Uint8Array view —
          // matches the `unknownMessage` payload convention. No copy: the
          // Buffer returned by FrameParser already aliases the input
          // buffer, so callers who need ownership should clone explicitly.
          this.emit("userCommand", {
            tick: frame.tick,
            playerSlot: frame.playerSlot,
            sequence: frame.userCmdData.sequence,
            data: frame.userCmdData.data,
          });
        }
        if (frame.customData !== undefined) {
          this.emit("customData", {
            tick: frame.tick,
            type: frame.customData.type,
            data: frame.customData.data,
          });
        }
        if (frame.stringTablesData !== undefined) {
          // Snapshot frames can be malformed in unusual recordings — guard
          // them with the same `corrupt-stringtable` recovery used for
          // CreateStringTable / UpdateStringTable, so a single bad blob
          // doesn't terminate the parse.
          try {
            this.handleStringTableSnapshot(frame.tick, frame.stringTablesData);
          } catch (err) {
            this.emitParserError(
              "corrupt-stringtable",
              err,
              `dem_stringtables snapshot decode failed`,
              this._lastFrameOffset,
            );
          }
        }
      } catch (err) {
        // Frame-body decoder threw past the per-message guard — typically a
        // truncated packet whose internal varint length walks off the end of
        // the dispatcher's private ByteReader, or a corrupt datatables blob.
        // Surface as `parserError` and terminate: we've lost wire-stream
        // alignment within this frame and cannot safely advance to the next.
        const isTruncation = err instanceof RangeError;
        this.emitParserError(
          isTruncation ? "truncated" : "other",
          err,
          isTruncation
            ? `Unexpected EOF inside frame body: ${(err as RangeError).message}`
            : `Frame body decode failed: ${err instanceof Error ? err.message : String(err)}`,
          this._lastFrameOffset,
        );
        return;
      }
    }
  }

  /**
   * Common emit helper for the typed `parserError` event. Coerces unknown
   * thrown values into `Error` so the public `cause` field is always the
   * documented type, and clamps `byteOffset` to a finite non-negative
   * integer for downstream tooling.
   */
  private emitParserError(
    kind: ParserErrorKind,
    cause: unknown,
    message: string,
    byteOffset: number,
  ): void {
    const errCause = cause instanceof Error ? cause : new Error(String(cause));
    const offset = Number.isFinite(byteOffset) && byteOffset >= 0 ? byteOffset : 0;
    this.emit("parserError", {
      kind,
      tick: this._currentTick,
      byteOffset: offset,
      message,
      cause: errCause,
    });
  }

  /**
   * Decode a CSVCMsg_CreateStringTable and register the resulting
   * StringTable on the manager. Decompresses the bit-stream payload first
   * if the message indicates Snappy compression. Emits
   * `stringTableCreated` with `{ name, table }`.
   */
  private handleCreateStringTable(msg: CSVCMsg_CreateStringTable): void {
    if (this._stringTables === undefined) {
      this._stringTables = new StringTableManager();
    }
    const table = new StringTable({
      name: msg.name ?? "",
      maxEntries: msg.maxEntries ?? 0,
      userDataFixedSize: msg.userDataFixedSize ?? false,
      userDataSize: msg.userDataSize ?? 0,
      userDataSizeBits: msg.userDataSizeBits ?? 0,
      flags: msg.flags ?? 0,
    });
    const tableId = this._stringTables.register(table);
    const history: string[] = [];
    this.stringTableHistories.set(tableId, history);

    const stringData = msg.stringData;
    const numEntries = msg.numEntries ?? 0;
    if (stringData !== undefined && stringData.length > 0 && numEntries > 0) {
      const decoded = this.decompressIfNeeded(stringData, msg.flags ?? 0);
      // If decompression was needed but the runtime is unavailable (TASK-024
      // not yet enabled or snappy import failed), skip the entry parse but
      // still register the table — downstream consumers can detect missing
      // entries via `table.size === 0`.
      if (decoded !== undefined) {
        const bitReader = new BitReader(decoded);
        // Leading "encode_using_dictionaries" flag bit. Must be 0 — Source
        // never sets this on the wire. demoinfocs panics if it's set.
        const dictBit = bitReader.readBit();
        if (dictBit === 0) {
          parseStringTableEntries(bitReader, table, numEntries, history);
        }
      }
    }
    if (table.name === "userinfo" && this._userInfoIndex !== null) {
      this._userInfoIndex.refresh();
    }
    this.emit("stringTableCreated", { name: table.name, table });
  }

  /**
   * Decode a CSVCMsg_UpdateStringTable and apply it to the existing table.
   * Looks up the table by wire id and threads the same history ring used
   * for the original CreateStringTable. Emits `stringTableUpdated` with
   * `{ name, changedEntries }`.
   */
  private handleUpdateStringTable(msg: CSVCMsg_UpdateStringTable): void {
    if (this._stringTables === undefined) return;
    const tableId = msg.tableId ?? -1;
    const table = this._stringTables.getById(tableId);
    if (table === undefined) return;
    const history = this.stringTableHistories.get(tableId) ?? [];
    const stringData = msg.stringData;
    const numChangedEntries = msg.numChangedEntries ?? 0;
    if (stringData === undefined || stringData.length === 0 || numChangedEntries <= 0) {
      return;
    }
    const bitReader = new BitReader(stringData);
    // Leading dictionary-encode flag (always 0 in CSGO demos).
    const dictBit = bitReader.readBit();
    if (dictBit !== 0) return;
    const { changedEntries } = parseStringTableEntries(
      bitReader,
      table,
      numChangedEntries,
      history,
    );
    if (table.name === "userinfo" && this._userInfoIndex !== null) {
      this._userInfoIndex.refresh();
    }
    this.emit("stringTableUpdated", { name: table.name, changedEntries });
  }

  /**
   * Decode a `dem_stringtables` snapshot frame and merge it into the live
   * StringTableManager. The snapshot is a periodic full dump of every
   * server-side string table — distinct from the incremental
   * CreateStringTable / UpdateStringTable bit-stream messages.
   *
   * Behaviour:
   *   - For every decoded table whose name is already registered, entries
   *     are overwritten by index — `entries[i]` of the snapshot becomes the
   *     StringTable's entry at index `i`. Client-only entries (typically
   *     `userinfo`'s reserved bot slots) are appended after the regular
   *     entries.
   *   - For every decoded table whose name is NOT registered yet, a fresh
   *     `StringTable` is created with `maxEntries: max(numEntries, 256)` and
   *     zero defaults for the rest of the construction fields, then
   *     populated. This handles snapshots that reference tables predating
   *     any CreateStringTable observation (rare but legal in older recording
   *     pipelines).
   *   - The `userinfo` index is refreshed once afterwards if any decoded
   *     table touched it AND the index has already been built — same hook
   *     used by Create/UpdateStringTable.
   *   - Emits `stringTableSnapshot` exactly once with the fully-decoded
   *     payload so power users can inspect the snapshot without needing the
   *     StringTableManager.
   */
  private handleStringTableSnapshot(tick: number, data: Buffer): void {
    const snapshot = parseStringTableSnapshot(data);
    if (this._stringTables === undefined) {
      this._stringTables = new StringTableManager();
    }
    let userInfoTouched = false;
    for (const decoded of snapshot.tables) {
      this.applySnapshotTable(decoded);
      if (decoded.name === "userinfo") userInfoTouched = true;
    }
    if (userInfoTouched && this._userInfoIndex !== null) {
      this._userInfoIndex.refresh();
    }
    this.emit("stringTableSnapshot", { tick, snapshot });
  }

  /**
   * Apply a single decoded snapshot table to the live StringTableManager —
   * registering a fresh StringTable if none with this name exists yet, then
   * overwriting (or appending) entries by index.
   */
  private applySnapshotTable(decoded: DecodedSnapshotTable): void {
    if (this._stringTables === undefined) {
      // Defensive — caller (`handleStringTableSnapshot`) lazy-inits this. We
      // re-check here so `applySnapshotTable` can be reasoned about in
      // isolation without a non-null assertion below.
      this._stringTables = new StringTableManager();
    }
    let table = this._stringTables.getByName(decoded.name);
    if (table === undefined) {
      // Snapshot references a table the parser hasn't seen a
      // CreateStringTable for yet. Register a new one with a `maxEntries`
      // floor of 256 — the common Source convention; large enough to
      // accommodate any subsequent UpdateStringTable that may target this
      // table while keeping `setEntry`'s range check meaningful.
      const maxEntries = Math.max(decoded.entries.length + decoded.clientEntries.length, 256);
      table = new StringTable({
        name: decoded.name,
        maxEntries,
        userDataFixedSize: false,
        userDataSize: 0,
        userDataSizeBits: 0,
        flags: 0,
      });
      const tableId = this._stringTables.register(table);
      // Mirror CreateStringTable: every registered table needs a history ring
      // so a later UpdateStringTable can reuse the same dictionary slot.
      this.stringTableHistories.set(tableId, []);
    }
    // Overwrite regular entries by index. Skip out-of-range indices defensively
    // — a snapshot from a re-recorded demo could legitimately exceed the
    // StringTable's `maxEntries` if the original Create message used a smaller
    // cap; surfacing this as a partial merge beats throwing.
    for (let i = 0; i < decoded.entries.length; i++) {
      const entry = decoded.entries[i];
      if (i >= table.maxEntries) break;
      const userData = entry.data.byteLength > 0 ? entry.data : undefined;
      table.setEntry(i, entry.key, userData);
    }
    // Append client entries after the regular ones, continuing the index
    // sequence. This matches the Source convention where client-only userinfo
    // slots (reserved bot entries) live above the player count.
    const clientStart = decoded.entries.length;
    for (let i = 0; i < decoded.clientEntries.length; i++) {
      const idx = clientStart + i;
      if (idx >= table.maxEntries) break;
      const entry = decoded.clientEntries[i];
      const userData = entry.data.byteLength > 0 ? entry.data : undefined;
      table.setEntry(idx, entry.key, userData);
    }
  }

  /**
   * Drop memoized overlay arrays whose membership depends on the given
   * ServerClass. Called from the entity create / delete hooks so the next
   * `parser.players` / `parser.teams` / `parser.weapons` access rebuilds
   * fresh — required because the dispatcher (TASK-037 + Tier-1 enrichers)
   * accesses these getters mid-parse, and a stale empty cache from an early
   * read would suppress every subsequent `resolvePlayer` lookup. Cheap: the
   * subsequent rebuild is one filtered scan over the entity list.
   */
  private invalidateOverlayCache(entity: { serverClass: { className: string; flattenedProps: ReadonlyArray<{ prop: { varName: string } }> } }): void {
    const className = entity.serverClass.className;
    if (className === "CCSPlayer") {
      this._playersCache = null;
      // A new/deleted CCSPlayer also affects the per-team playerSlots array.
      this._teamsCache = null;
    } else if (className === "CCSTeam") {
      this._teamsCache = null;
    } else if (entity.serverClass.flattenedProps.some((p) => p.prop.varName === "m_iClip1")) {
      // Same duck-type predicate as `get weapons()` — every weapon
      // ServerClass (CWeapon*, CC4, CKnife, plus future variants) carries
      // `m_iClip1`. Authoritative match without enumerating class names.
      this._weaponsCache = null;
    }
  }

  /**
   * Bridge from the PacketEntities create/update hook to the RoundTracker.
   * Filters to the singleton `CCSGameRulesProxy` entity — every other entity
   * is a no-op. Reads the four `RoundPhaseInputs` fields off the live
   * `gameRules` overlay (which auto-memoizes on first proxy observation, so
   * this is O(entities) once and O(1) per tick thereafter) and feeds them
   * into the tracker, which emits `roundStateChanged` on phase transitions.
   */
  private feedRoundTracker(entity: { serverClass: { className: string } }): void {
    if (entity.serverClass.className !== "CCSGameRulesProxy") return;
    const gr = this.gameRules;
    if (gr === undefined) return;
    this._roundTracker.onUpdate({
      gamePhase: gr.gamePhase,
      isWarmup: gr.isWarmup,
      isFreezePeriod: gr.isFreezePeriod,
      roundWinStatus: gr.roundWinStatus,
      totalRoundsPlayed: gr.totalRoundsPlayed,
    });
  }

  /**
   * Decode a CSVCMsg_PacketEntities message and apply its create / update /
   * delete operations to the entity list. Requires datatables (for the
   * ServerClass registry) and string tables (for instance baselines) — if
   * either is missing the message is dropped silently, since by-design they
   * arrive earlier in the wire stream.
   */
  private handlePacketEntities(msg: CSVCMsg_PacketEntities): void {
    if (this._serverClasses === undefined || this._stringTables === undefined) {
      return;
    }
    try {
      decodePacketEntities(msg, this._entities, this._serverClasses, this._stringTables, {
        onCreate: (entity) => {
          this.invalidateOverlayCache(entity);
          this.emit("entityCreated", entity);
          this.feedRoundTracker(entity);
        },
        onUpdate: (entity) => {
          this.emit("entityUpdated", entity);
          this.feedRoundTracker(entity);
        },
        onDelete: (entity) => {
          this.invalidateOverlayCache(entity);
          this.emit("entityDeleted", entity);
        },
      });
    } catch (err) {
      // Per-prop decoder divergence (TASK-021a) or flatten miscount
      // (TASK-018a) can desync the bit stream mid-message. Each
      // PacketEntities message owns its own BitReader (instantiated from
      // `msg.entityData`), so a desync is isolated to that single message
      // — the next message starts with a fresh cursor. Surface the failure
      // via `entityDecodeError` and continue parsing; pre-021b we would
      // self-disable here, which silently dropped the rest of the demo
      // (thousands of legitimate entityCreated/Updated events).
      this.emit("entityDecodeError", err);
    }
  }

  /**
   * Decode a CSVCMsg_GameEventList message (TASK-036) and store the resulting
   * descriptor table on the parser. CS:GO networks this exactly once during
   * signon, before any CSVCMsg_GameEvent fires, so storing the freshest table
   * unconditionally is correct — there is nothing to merge or reconcile.
   * Downstream code (TASK-037 GameEvent decoder) reads `_eventDescriptors`
   * synchronously when interpreting each event payload.
   */
  private handleGameEventList(msg: CSVCMsg_GameEventList): void {
    // Capture before emit so synchronous listeners that observe both the
    // event payload and `parser.gameEventDescriptors` see a consistent state
    // — same pattern as `onServerInfo` above.
    const table = buildDescriptorTable(msg);
    this._eventDescriptors = table;
    this.emit("gameEventListReady", table);
  }

  /**
   * Decode a `CSVCMsg_GameEvent` message (TASK-037) and emit the Tier-2
   * catch-all `gameEvent` typed event with the decoded payload.
   *
   * Wire-order discipline: CS:GO networks `CSVCMsg_GameEventList` once
   * during signon BEFORE any `CSVCMsg_GameEvent` fires. If we somehow
   * observe a GameEvent before the descriptor table arrives, the message
   * is dropped silently — there's no schema with which to interpret it.
   * This shouldn't happen on a well-formed demo.
   *
   * Decode-error policy: when the descriptor table doesn't contain the
   * incoming event id, we surface a `gameEventDecodeError` event with the
   * id and continue. We never throw — a single unknown event id should
   * not abort the parse for the remaining (valid) events on the wire.
   */
  private handleGameEvent(msg: CSVCMsg_GameEvent): void {
    if (this._eventDescriptors === undefined) return;
    const decoded = decodeGameEvent(msg, this._eventDescriptors);
    if (decoded === undefined) {
      this.emit("gameEventDecodeError", { eventId: msg.eventid ?? 0 });
      return;
    }
    this.emit("gameEvent", decoded);
    // Tier-1 dispatch (ADR-006). Tier-1 fires AFTER Tier-2 so a consumer
    // subscribed to both observes the raw payload first — no surprise
    // reordering. Empty-table fast path: when no enrichers are registered
    // (pre-TASK-038) the `.get` returns `undefined` and we exit cheaply.
    const enricher = enricherTable.get(decoded.name);
    if (enricher !== undefined) {
      const ctx = buildEnricherContext(this);
      const enriched = enricher(decoded, ctx);
      if (enriched !== null) {
        // `decoded.name` is guaranteed to be a Tier-1 key (we looked it up
        // from `enricherTable`), but the type system can't narrow `string` to
        // the exact union of Tier-1 keys here. The cast is safe: the enricher
        // contract (ADR-006) guarantees the payload type matches the key.
        this.emit(
          decoded.name as keyof Tier1EventMap,
          enriched as Tier1EventMap[keyof Tier1EventMap],
        );
      } else {
        this.emit("gameEventEnrichmentSkipped", {
          name: decoded.name,
          eventId: decoded.eventId,
        });
      }
    }
  }

  /**
   * Decode a `CSVCMsg_UserMessage` (TASK-047) and route chat-related
   * variants (`CS_UM_SayText`, `CS_UM_SayText2`, `CS_UM_TextMsg`) through
   * `decodeChatMessage`. On a successful decode the typed `chatMessage`
   * event fires with the resulting `ChatMessage`. Non-chat user messages
   * (game UI, hints, paint-map data, …) return `undefined` from the
   * decoder and are dropped silently — we do not surface them as a
   * generic `userMessage` event in v0.1.
   *
   * Sender resolution: SayText2 carries `ent_idx` (the speaker's entity
   * id, which on CSGO is `slot+1` per the same `+1` convention
   * `EnricherContext.resolvePlayer` uses). The decoder routes through
   * the supplied context's `userInfoIndex` and `resolvePlayer`, so a
   * speaker who's already disconnected mid-tick surfaces as `sender:
   * undefined` with `senderName` falling back to the wire param.
   *
   * Decode errors (proto-level) propagate from `decodeChatMessage` and
   * abort this handler — but ts-proto's decoders tolerate empty / under-
   * populated blobs, so a throw here is exceptional. If it ever happens
   * we let it bubble; the dispatcher's outer loop continues with the
   * next message in the packet.
   */
  private handleUserMessage(msg: CSVCMsg_UserMessage): void {
    const ctx = this.buildChatMessageContext();
    const decoded = decodeChatMessage(msg, ctx);
    if (decoded === undefined) return;
    this.emit("chatMessage", decoded);
  }

  /**
   * Handle a decoded `CSVCMsg_VoiceData` message (TASK-051) and emit the
   * Tier-3 `voiceData` event verbatim — no audio decoding, only client
   * resolution and field normalisation.
   *
   * `client` is the speaker's zero-based entity slot (per CSGO's wire
   * convention for this message). We resolve it to a `Player` via the
   * `userInfoIndex` slot→userId step, then scan the live `players` array
   * for the matching `slot+1` entity id (same `slot+1` adjustment used by
   * the chat-message and enricher contexts). When the userinfo table hasn't
   * caught up yet — only seen during the brief signon window before the
   * `userinfo` string table populates a slot — `player` is `undefined`,
   * which the event's typed payload allows.
   *
   * The proto's `proximity` is a boolean; we normalise it to a `0|1`
   * number to match the documented wire shape and to keep the payload free
   * of provider-specific quirks. The `voiceData` byte slice is forwarded
   * by reference (no copy) — consumers that need to retain it across
   * dispatches must clone explicitly, same convention as `unknownMessage`
   * and `userCommand`. An empty / missing `voiceData` is skipped silently
   * (a voice frame with zero audio bytes is not a meaningful event).
   */
  private handleVoiceData(msg: CSVCMsg_VoiceData): void {
    const data = msg.voiceData;
    if (data === undefined || data.length === 0) return;
    const client = msg.client;
    let player: Player | undefined;
    if (client !== undefined && client >= 0) {
      const userId = this.userInfoIndex.userIdForEntitySlot(client);
      if (userId !== undefined) {
        const entityId = client + 1;
        for (const p of this.players) {
          if (p.slot === entityId) {
            player = p;
            break;
          }
        }
      }
    }
    this.emit("voiceData", {
      tick: this._currentTick,
      player,
      format: msg.format ?? 0,
      proximity: msg.proximity === true ? 1 : 0,
      data,
    });
  }

  /**
   * Build a `ChatMessageContext` for the user-message decoder. Mirrors
   * `buildEnricherContext` but stays scoped to what `decodeChatMessage`
   * needs — `players`, `userInfoIndex`, and a `resolvePlayer` shim that
   * applies the `slot+1` entity-id convention.
   */
  private buildChatMessageContext(): ChatMessageContext {
    const players = this.players;
    const userInfoIndex = this.userInfoIndex;
    const ctx: ChatMessageContext = {
      players,
      userInfoIndex,
      tick: this._currentTick,
      resolvePlayer(userId: number): Player | undefined {
        const tableSlot = userInfoIndex.entitySlotForUserId(userId);
        if (tableSlot === undefined) return undefined;
        const entityId = tableSlot + 1;
        for (const p of players) {
          if (p.slot === entityId) return p;
        }
        return undefined;
      },
    };
    return Object.freeze(ctx);
  }

  /**
   * Detect Snappy compression on a CreateStringTable's stringData blob and
   * decompress if needed.
   *
   * In the CSGO-era proto schema we use, the `flags` field on
   * CSVCMsg_CreateStringTable does NOT carry a compression bit — `flags=1`
   * is `STRINGTABLE_FLAG_PRECACHE`, not data-compressed. Compression
   * detection is done via the magic prefix instead: if the first 4 bytes
   * are ASCII "SNAP" the payload is wrapped in Source's
   * compressed-string-table envelope (`SNAP` + int32 LE length + snappy
   * body); otherwise the bytes are the raw bit-stream.
   *
   * The newer CS2 schema does carry a `data_compressed` bool on the
   * message itself; if/when this parser supports CS2 demos that field
   * should be threaded through here as a separate signal.
   *
   * Returns the decompressed (or pass-through) bytes, or `undefined`
   * when compression is detected but snappyjs is unavailable.
   */
  private decompressIfNeeded(data: Uint8Array, _flags: number): Uint8Array | undefined {
    if (data.length < 4) return data;
    const looksCompressed =
      data[0] === 0x53 && data[1] === 0x4e && data[2] === 0x41 && data[3] === 0x50;
    if (!looksCompressed) return data;
    return decompressSnappy(data);
  }
}

/**
 * Re-export of StringTableEntry for the typed event payload below — keeps
 * the symbol referenced so a downstream `import('./DemoParser.js')` sees a
 * compatible event signature.
 */
export type _StringTableEntryEventPayload = StringTableEntry;

/**
 * Decode the raw payload of a `dem_consolecmd` frame into its ASCII command
 * string. CSGO records the buffer verbatim and *sometimes* includes the
 * trailing C-string null terminator inside the length-prefixed slice — so we
 * strip exactly one trailing `\0` when present and leave any other content
 * (including embedded nulls, which are not expected but harmless) alone.
 *
 * The payload is treated as `latin1` rather than UTF-8 because console
 * commands have always been ASCII in the engine; defaulting to `latin1`
 * avoids Buffer's UTF-8 replacement character substitution if a non-ASCII
 * byte ever sneaks through (e.g. a user-typed alias with locale-specific
 * characters).
 */
function decodeConsoleCommand(data: Buffer): string {
  if (data.length === 0) return "";
  const end = data[data.length - 1] === 0x00 ? data.length - 1 : data.length;
  return data.toString("latin1", 0, end);
}

/**
 * Discriminator for {@link ParserEventMap.parserError}. Mirrors the public
 * union exactly — kept as a local alias so the DemoParser implementation
 * doesn't have to reach back through the event map's index types every time
 * it constructs a payload.
 */
type ParserErrorKind = ParserEventMap["parserError"]["kind"];

/**
 * Classify a throw caught from `iterateFrames(...).next()` into a
 * {@link ParserErrorKind} plus a human-readable description.
 *
 * The two recoverable categories are:
 *   - `truncated`    — `ByteReader.ensureAvailable` throws `RangeError` when
 *                      a read runs past the buffer end. Mid-frame EOF on a
 *                      .dem cut short by a network drop or a partial file
 *                      copy is the canonical case.
 *   - `invalid-frame`— `FrameParser.readFrame` throws a generic `Error` with
 *                      the literal "FrameParser: unknown command byte" prefix
 *                      when the first byte of a frame is not in the
 *                      `DemoCommands` enum.
 *
 * Anything else falls through to `"other"` — fatal by default. The message
 * preserves the original `err.message` so downstream tooling can string-match
 * if it needs finer-grained dispatch.
 */
function classifyFrameError(err: unknown): {
  kind: ParserErrorKind;
  message: string;
} {
  if (err instanceof RangeError) {
    return {
      kind: "truncated",
      message: `Unexpected EOF: ${err.message}`,
    };
  }
  if (err instanceof Error && err.message.startsWith("FrameParser: unknown command byte")) {
    return {
      kind: "invalid-frame",
      message: err.message,
    };
  }
  if (err instanceof Error) {
    return { kind: "other", message: err.message };
  }
  return { kind: "other", message: String(err) };
}
