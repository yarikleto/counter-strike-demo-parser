/**
 * EventRecorder — collects the plain-data event records of `DemoResult`:
 * kills, bomb lifecycle, grenade effects, hostage events, chat and the
 * full-match damage matrix.
 *
 * Every player is converted to a {@link PlayerRef} and every position copied
 * at event time, so the records stay correct after the parser moves on (or
 * the player disconnects and their slot is reused).
 *
 * Kills come from the enriched `player_death` event. Bomb, grenade-effect
 * and hostage records come from the raw `gameEvent` stream, because those
 * events carry `entityid` / `userid` fields the enriched forms drop, and a
 * record is still useful when the player cannot be resolved.
 *
 * `onKill` / `onBomb` let the round tracker consume the very same record
 * objects, so `rounds[i].kills` and `kills` share identity.
 */
import type { DemoParser } from "../DemoParser.js";
import type { Entity } from "../entities/Entity.js";
import type { DecodedGameEvent } from "../events/GameEventDecoder.js";
import type { PlayerDeathEvent } from "../events/enrichers/playerDeath.js";
import type { PlayerHurtEvent } from "../events/enrichers/playerHurt.js";
import type { ChatMessage } from "../events/UserMessageDecoder.js";
import type { Player, Vector3 } from "../state/Player.js";
import { resolveHandle } from "../state/EntityHandle.js";
import { readEntityOrigin } from "../state/EntityOrigin.js";
import { PlayerRoster, plainVector } from "./PlayerRoster.js";
import type { PlayerRef } from "./PlayerRoster.js";
import type {
  BombEventType,
  BombRecord,
  ChatRecord,
  DamageRecord,
  GrenadeEffect,
  GrenadeEffectType,
  HostageEventType,
  HostageRecord,
  KillRecord,
} from "./records.js";

const BOMB_EVENTS: Readonly<Record<string, BombEventType>> = {
  bomb_beginplant: "begin_plant",
  bomb_abortplant: "abort_plant",
  bomb_planted: "planted",
  bomb_begindefuse: "begin_defuse",
  bomb_abortdefuse: "abort_defuse",
  bomb_defused: "defused",
  bomb_exploded: "exploded",
  bomb_dropped: "dropped",
  bomb_pickup: "picked_up",
};

/** Bomb steps whose position is the bomb itself rather than the player. */
const AT_BOMB: ReadonlySet<BombEventType> = new Set([
  "begin_defuse",
  "abort_defuse",
  "defused",
  "exploded",
]);

const HOSTAGE_EVENTS: Readonly<Record<string, HostageEventType>> = {
  hostage_follows: "follows",
  hostage_stops_following: "stops_following",
  hostage_rescued: "rescued",
  hostage_hurt: "hurt",
  hostage_killed: "killed",
  hostage_rescued_all: "rescued_all",
};

/** Effects that start on one event and end on another. */
const LASTING_START: Readonly<Record<string, GrenadeEffectType>> = {
  smokegrenade_detonate: "smoke",
  inferno_startburn: "inferno",
};
const LASTING_END: ReadonlySet<string> = new Set(["smokegrenade_expired", "inferno_expire"]);
/** Instantaneous detonations. */
const INSTANT: Readonly<Record<string, GrenadeEffectType>> = {
  flashbang_detonate: "flash",
  hegrenade_detonate: "he",
  decoy_detonate: "decoy",
};

interface MutableEffect {
  type: GrenadeEffectType;
  entityIndex: number;
  thrower: PlayerRef | undefined;
  startTick: number;
  endTick: number | undefined;
  position: Vector3;
}

interface MutableDamage {
  attacker: PlayerRef;
  victim: PlayerRef;
  totalDamage: number;
  totalArmorDamage: number;
  hitCount: number;
  weapons: Record<string, number>;
  hitGroups: Record<number, number>;
}

export class EventRecorder {
  readonly kills: KillRecord[] = [];
  readonly bomb: BombRecord[] = [];
  readonly hostageEvents: HostageRecord[] = [];
  readonly chatMessages: ChatRecord[] = [];
  /** Called with every kill record as it is created. */
  onKill: ((record: KillRecord) => void) | undefined;
  /** Called with every bomb record as it is created. */
  onBomb: ((record: BombRecord) => void) | undefined;

  private readonly effects: MutableEffect[] = [];
  /** Open smokes / infernos by entity id. */
  private readonly activeEffects = new Map<number, MutableEffect>();
  private readonly damage = new Map<string, MutableDamage>();
  private parser: DemoParser | null = null;
  private roster: PlayerRoster | null = null;
  /** Position of the bomb planted this round (plant spot, then C4 entity). */
  private bombPosition: Vector3 | undefined;
  private playerResource: Entity | undefined;

  attach(parser: DemoParser): void {
    this.parser = parser;
    this.roster = PlayerRoster.for(parser);
    parser.on("player_death", (e) => this.onPlayerDeath(e));
    parser.on("player_hurt", (e) => this.onPlayerHurt(e));
    parser.on("chatMessage", (e) => this.onChat(e));
    parser.on("gameEvent", (e) => this.onGameEvent(e));
    parser.on("entityCreated", (e) => this.onEntityCreated(e));
    parser.on("round_start", () => this.onRoundStart());
    parser.on("begin_new_match", () => this.onRoundStart());
  }

  /** All grenade effects, in start order. */
  grenadeEffects(): GrenadeEffect[] {
    return this.effects.map((e) => ({ ...e }));
  }

  /** Full-match damage, one record per (attacker, victim) pair. */
  damageRecords(): DamageRecord[] {
    return [...this.damage.values()].map((d) => ({
      ...d,
      weapons: { ...d.weapons },
      hitGroups: { ...d.hitGroups },
    }));
  }

  // ---------------------------------------------------------------------------

  private onPlayerDeath(e: PlayerDeathEvent): void {
    const roster = this.roster!;
    const record: KillRecord = {
      tick: this.parser!.currentTick,
      attacker: roster.refOrUndefined(e.attacker),
      victim: roster.ref(e.victim),
      assister: roster.refOrUndefined(e.assister),
      weapon: e.weapon,
      headshot: e.headshot,
      penetrated: e.penetrated,
      noscope: e.noscope,
      thrusmoke: e.thrusmoke,
      attackerblind: e.attackerblind,
      attackerPosition: e.attacker !== undefined ? plainVector(e.attacker.position) : undefined,
      victimPosition: plainVector(e.victim.position),
    };
    this.kills.push(record);
    this.onKill?.(record);
  }

  private onPlayerHurt(e: PlayerHurtEvent): void {
    if (e.attacker === undefined) return;
    const roster = this.roster!;
    const attackerIndex = roster.indexOf(e.attacker);
    const victimIndex = roster.indexOf(e.victim);
    const key = `${attackerIndex}|${victimIndex}`;
    let d = this.damage.get(key);
    if (d === undefined) {
      d = {
        attacker: roster.ref(e.attacker),
        victim: roster.ref(e.victim),
        totalDamage: 0,
        totalArmorDamage: 0,
        hitCount: 0,
        weapons: {},
        hitGroups: {},
      };
      this.damage.set(key, d);
    }
    d.totalDamage += e.damage;
    d.totalArmorDamage += e.damageArmor;
    d.hitCount += 1;
    const weapon = e.weapon === "" ? "unknown" : e.weapon;
    d.weapons[weapon] = (d.weapons[weapon] ?? 0) + 1;
    d.hitGroups[e.hitGroup] = (d.hitGroups[e.hitGroup] ?? 0) + 1;
  }

  private onChat(e: ChatMessage): void {
    this.chatMessages.push({
      tick: e.tick,
      sender: this.roster!.refOrUndefined(e.sender),
      senderName: e.senderName,
      message: e.message,
      isTeamChat: e.isTeamChat,
      raw: e.raw,
    });
  }

  private onEntityCreated(entity: Entity): void {
    // CPlantedC4 appears just after `bomb_planted`; its origin is the most
    // precise bomb position for the defuse / explode records.
    if (entity.serverClass.className === "CPlantedC4") {
      this.bombPosition = readEntityOrigin(entity) ?? this.bombPosition;
    }
  }

  private onRoundStart(): void {
    const tick = this.parser!.currentTick;
    // Round restart clears the world: close effects that never expired.
    for (const effect of this.activeEffects.values()) effect.endTick = tick;
    this.activeEffects.clear();
    this.bombPosition = undefined;
  }

  private onGameEvent(e: DecodedGameEvent): void {
    const bombType = BOMB_EVENTS[e.name];
    if (bombType !== undefined) {
      this.recordBomb(bombType, e);
      return;
    }
    const lasting = LASTING_START[e.name];
    const instant = INSTANT[e.name];
    if (lasting !== undefined || instant !== undefined) {
      this.startEffect((lasting ?? instant)!, e, instant !== undefined);
      return;
    }
    if (LASTING_END.has(e.name)) {
      const id = numberField(e, "entityid");
      const effect = id !== undefined ? this.activeEffects.get(id) : undefined;
      if (effect !== undefined) {
        effect.endTick = this.parser!.currentTick;
        this.activeEffects.delete(id!);
      }
      return;
    }
    const hostageType = HOSTAGE_EVENTS[e.name];
    if (hostageType !== undefined) this.recordHostage(hostageType, e);
  }

  private recordBomb(type: BombEventType, e: DecodedGameEvent): void {
    const player = this.playerForUserId(numberField(e, "userid"));
    const playerPosition = player !== undefined ? plainVector(player.position) : undefined;
    if (type === "planted") this.bombPosition = playerPosition;
    const position = AT_BOMB.has(type) ? (this.bombPosition ?? playerPosition) : playerPosition;
    const siteEntityIndex = numberField(e, "site");
    const record: BombRecord = {
      type,
      tick: this.parser!.currentTick,
      player: this.roster!.refOrUndefined(player),
      position: position !== undefined ? { ...position } : undefined,
      site: siteEntityIndex !== undefined ? this.siteLetter(position) : undefined,
      siteEntityIndex,
      ...(type === "begin_defuse" ? { hasKit: e.data.haskit === true } : {}),
    };
    this.bomb.push(record);
    this.onBomb?.(record);
  }

  private startEffect(type: GrenadeEffectType, e: DecodedGameEvent, instant: boolean): void {
    const entityIndex = numberField(e, "entityid") ?? 0;
    const tick = this.parser!.currentTick;
    const thrower =
      type === "inferno"
        ? this.infernoOwner(entityIndex)
        : this.playerForUserId(numberField(e, "userid"));
    const effect: MutableEffect = {
      type,
      entityIndex,
      thrower: this.roster!.refOrUndefined(thrower),
      startTick: tick,
      endTick: instant ? tick : undefined,
      position: {
        x: numberField(e, "x") ?? 0,
        y: numberField(e, "y") ?? 0,
        z: numberField(e, "z") ?? 0,
      },
    };
    this.effects.push(effect);
    if (!instant) this.activeEffects.set(entityIndex, effect);
  }

  private recordHostage(type: HostageEventType, e: DecodedGameEvent): void {
    const player = this.playerForUserId(numberField(e, "userid"));
    const hostageEntityIndex = numberField(e, "hostage");
    const hostage =
      hostageEntityIndex !== undefined ? this.parser!.entities.get(hostageEntityIndex) : undefined;
    const position =
      (hostage !== undefined ? readEntityOrigin(hostage) : undefined) ??
      (player !== undefined ? plainVector(player.position) : undefined);
    this.hostageEvents.push({
      type,
      tick: this.parser!.currentTick,
      player: this.roster!.refOrUndefined(player),
      hostageEntityIndex,
      position,
    });
  }

  // ---------------------------------------------------------------------------

  private playerForUserId(userId: number | undefined): Player | undefined {
    if (userId === undefined || userId === 0) return undefined;
    const tableSlot = this.parser!.userInfoIndex.entitySlotForUserId(userId);
    if (tableSlot === undefined) return undefined;
    // Same `tableSlot + 1` bridge as EnricherContext.resolvePlayer.
    const entityId = tableSlot + 1;
    for (const p of this.parser!.players) {
      if (p.slot === entityId) return p;
    }
    return undefined;
  }

  /** The player who threw the molotov/incendiary behind a CInferno. */
  private infernoOwner(entityIndex: number): Player | undefined {
    const parser = this.parser!;
    const inferno = parser.entities.get(entityIndex);
    if (inferno === undefined) return undefined;
    const handle = inferno.propByName("m_hOwnerEntity");
    if (typeof handle !== "number") return undefined;
    const owner = resolveHandle(parser.entities, handle);
    if (owner === undefined) return undefined;
    for (const p of parser.players) {
      if (p.slot === owner.id) return p;
    }
    return undefined;
  }

  /** Nearest of the two bombsite centres networked on CCSPlayerResource. */
  private siteLetter(position: Vector3 | undefined): "A" | "B" | undefined {
    if (position === undefined) return undefined;
    if (this.playerResource === undefined || this.playerResource.state === "free") {
      this.playerResource = undefined;
      for (const [, entity] of this.parser!.entities.entries()) {
        if (entity.serverClass.className === "CCSPlayerResource") {
          this.playerResource = entity;
          break;
        }
      }
    }
    const resource = this.playerResource;
    if (resource === undefined) return undefined;
    const a = resource.propByName("m_bombsiteCenterA");
    const b = resource.propByName("m_bombsiteCenterB");
    if (!isVector(a) || !isVector(b)) return undefined;
    return distanceSq(position, a) <= distanceSq(position, b) ? "A" : "B";
  }
}

function numberField(e: DecodedGameEvent, key: string): number | undefined {
  const v = e.data[key];
  return typeof v === "number" ? v : undefined;
}

function isVector(v: unknown): v is Vector3 {
  return typeof v === "object" && v !== null && "x" in v && "y" in v;
}

function distanceSq(p: Vector3, q: Vector3): number {
  return (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
}
