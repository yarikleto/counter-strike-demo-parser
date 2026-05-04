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
import { TypedEventEmitter } from "./events/TypedEventEmitter.js";
import type { ParserEventMap, Tier1EventMap } from "./events/ParserEventMap.js";
import { ByteReader } from "./reader/ByteReader.js";
import { BitReader } from "./reader/BitReader.js";
import { parseHeader } from "./frame/header.js";
import type { DemoHeader } from "./frame/header.js";
import { iterateFrames } from "./frame/FrameParser.js";
import { MessageDispatcher } from "./packet/MessageDispatch.js";
import type {
  CSVCMsg_CreateStringTable,
  CSVCMsg_GameEvent,
  CSVCMsg_GameEventList,
  CSVCMsg_PacketEntities,
  CSVCMsg_ServerInfo,
  CSVCMsg_UpdateStringTable,
  CSVCMsg_UserMessage,
} from "./proto/index.js";
import { parseDataTables } from "./datatables/DataTablesParser.js";
import type { SendTableRegistry } from "./datatables/SendTableRegistry.js";
import { ServerClassRegistry } from "./datatables/ServerClassRegistry.js";
import { StringTable } from "./stringtables/StringTable.js";
import type { StringTableEntry } from "./stringtables/StringTable.js";
import { StringTableManager } from "./stringtables/StringTableManager.js";
import { parseStringTableEntries } from "./stringtables/StringTableParser.js";
import { decompressSnappy } from "./stringtables/Compression.js";
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
    const out: Player[] = [];
    for (const [id, entity] of this._entities.entries()) {
      if (entity.serverClass.className === "CCSPlayer") {
        out.push(new Player(id, entity));
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
   */
  static async parse(input: string | Buffer, options: ParseOptions = {}): Promise<DemoResult> {
    const buffer: Buffer = typeof input === "string" ? await readFile(input) : input;

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

    parser.parseAll();

    return Object.freeze({
      header: parser.header as DemoHeader,
      players: parser.players.map((p) => p.snapshot()),
      kills,
      rounds: roundTracker.snapshot(),
      grenades,
      chatMessages,
      events,
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
   * Parse the entire demo file synchronously, emitting events as they occur.
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
        this.handleCreateStringTable(msg);
      },
      onUpdateStringTable: (msg: CSVCMsg_UpdateStringTable) => {
        this.handleUpdateStringTable(msg);
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
    });

    for (const frame of iterateFrames(reader)) {
      // Update current tick before dispatching so event listeners always read
      // the correct frame tick when they access `parser.currentTick`.
      this._currentTick = frame.tick;
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
    }
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
