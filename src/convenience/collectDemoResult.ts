/**
 * collectDemoResult — runs a parser to completion with every convenience
 * tracker attached and assembles the plain-data {@link DemoResult}.
 *
 * Shared by the browser and Node flavours of `DemoParser.parse()`.
 */
import type { DemoParser } from "../DemoParser.js";
import type { DemoHeader } from "../frame/header.js";
import type { DecodedGameEvent } from "../events/GameEventDecoder.js";
import type { DemoResult, ParseOptions } from "./DemoResult.js";
import { ConvenienceRoundTracker } from "./RoundTracker.js";
import { EventRecorder } from "./EventRecorder.js";
import { GrenadeTrajectoryTracker } from "./GrenadeTrajectoryTracker.js";
import { PositionRecorder } from "./PositionRecorder.js";
import { ShotRecorder } from "./ShotRecorder.js";
import { HitRecorder } from "./HitRecorder.js";
import { VoiceRecorder } from "./VoiceRecorder.js";
import { PlayerRoster } from "./PlayerRoster.js";
import type { GrenadeThrow } from "./records.js";
import type { MatchScore } from "./RoundTracker.js";
import { TeamSide } from "../enums/TeamSide.js";

/** Default `positionSampleRateTicks`. */
const DEFAULT_POSITION_SAMPLE_RATE = 32;

export async function collectDemoResult(
  parser: DemoParser,
  options: ParseOptions = {},
): Promise<DemoResult> {
  const events: DecodedGameEvent[] | undefined = options.includeRawEvents ? [] : undefined;
  if (events !== undefined) parser.on("gameEvent", (e) => events.push(e));

  const recorder = new EventRecorder();
  recorder.attach(parser);
  const rounds = new ConvenienceRoundTracker();
  rounds.attach(parser);
  // The round tracker files the very same kill / bomb records by round.
  recorder.onKill = (record) => rounds.onKill(record);
  recorder.onBomb = (record) => rounds.onBomb(record);

  const trajectories = new GrenadeTrajectoryTracker();
  trajectories.attach(parser);
  const shots = new ShotRecorder();
  shots.attach(parser);
  const hits = new HitRecorder();
  hits.attach(parser);

  let positions: PositionRecorder | undefined;
  if (options.collectPlayerPositions === true) {
    const rate = options.positionSampleRateTicks ?? DEFAULT_POSITION_SAMPLE_RATE;
    positions = new PositionRecorder(rate);
    positions.attach(parser);
  }

  let voice: VoiceRecorder | undefined;
  if (options.collectVoice === true) {
    voice = new VoiceRecorder();
    voice.attach(parser);
  }

  if (options.onProgress !== undefined || options.signal !== undefined) {
    await parser.parseAllAsync({
      onProgress: options.onProgress,
      signal: options.signal,
      yieldIntervalMs: options.yieldIntervalMs,
    });
  } else {
    // Yield once so callers chaining several parses keep the event loop
    // responsive, then parse synchronously (fastest path).
    await Promise.resolve();
    parser.parseAll();
  }

  const grenadeTrajectories = [...trajectories.snapshot()];
  const grenades: GrenadeThrow[] = grenadeTrajectories.map((t) => ({
    entityIndex: t.entityIndex,
    type: t.type,
    tick: t.throwTick,
    thrower: t.thrower,
    throwerPosition: t.throwerPosition,
    position: t.trajectory[0] !== undefined ? { ...t.trajectory[0] } : undefined,
  }));
  grenades.sort((a, b) => a.tick - b.tick);

  return {
    header: { ...(parser.header as DemoHeader) },
    tickRate: parser.serverInfoState?.tickRate ?? 0,
    players: PlayerRoster.for(parser).snapshot(),
    kills: recorder.kills,
    rounds: rounds.snapshot(),
    score: finalScore(parser),
    bomb: recorder.bomb,
    grenades,
    grenadeTrajectories,
    grenadeEffects: recorder.grenadeEffects(),
    hostageEvents: recorder.hostageEvents,
    damage: recorder.damageRecords(),
    chatMessages: recorder.chatMessages,
    shots: shots.snapshot(),
    hits: hits.snapshot(),
    events,
    positions: positions?.snapshot(),
    voice: voice?.snapshot(),
  };
}

/** Scores held by the CT and T team entities at the end of the demo. */
function finalScore(parser: DemoParser): MatchScore {
  let ct = 0;
  let t = 0;
  for (const team of parser.teams) {
    if (team.team === TeamSide.CT) ct = team.score;
    else if (team.team === TeamSide.T) t = team.score;
  }
  return { ct, t };
}
