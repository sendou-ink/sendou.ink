/**
 * Every event kind the scanner emits. A kind is declared next to its detector
 * (type, data shape, timeline merge policy, scheduler role); listing it here
 * puts it in the `DetectedEvent` union and hands its policy to the timeline
 * and the scheduler.
 */
import { DEATH_EVENT } from "./detectors/death/index";
import { KILL_EVENT } from "./detectors/kill/index";
import { MAP_START_EVENT } from "./detectors/map-start/index";
import { MINIMAP_EVENT } from "./detectors/minimap/index";
import { OBJECTIVE_EVENT } from "./detectors/objective/index";
import { PLAYER_STATUS_EVENT } from "./detectors/objective/player-status";
import { STRIP_WEAPONS_EVENT } from "./detectors/objective/strip-weapons";
import { QUICK_SCOREBOARD_BATTLE_LOG_EVENT } from "./detectors/quick-scoreboard-battle-log/index";
import { SCOREBOARD_EVENT } from "./detectors/scoreboard/index";
import { SCOREBOARD_BATTLE_LOG_EVENT } from "./detectors/scoreboard-battle-log/index";
import { SCOREBOARD_BATTLE_LOG_REPLAY_EVENT } from "./detectors/scoreboard-battle-log-replay/index";
import { SCOREBOARD_OWN_EVENT } from "./detectors/scoreboard-own/index";
import type { EventKind, EventOf } from "./detectors/types";
import { X_RANK_POSITION_EVENT } from "./detectors/x-rank/position";
import { X_SET_COUNT_EVENT } from "./detectors/x-rank/set-count";
import { X_SET_RESULT_EVENT } from "./detectors/x-rank/set-result";

/** Battle history screens: browsing them after playing shows games the timeline already holds. */
const HISTORY_SCOREBOARD_EVENT_KINDS = [
	SCOREBOARD_BATTLE_LOG_REPLAY_EVENT,
	SCOREBOARD_BATTLE_LOG_EVENT,
	QUICK_SCOREBOARD_BATTLE_LOG_EVENT,
] as const;

/** Kinds whose data is the full 8-player ScoreboardData shape. */
const SCOREBOARD_EVENT_KINDS = [
	SCOREBOARD_EVENT,
	...HISTORY_SCOREBOARD_EVENT_KINDS,
] as const;

/** The X Battle lobby cards. */
const X_BATTLE_CARD_EVENT_KINDS = [
	X_SET_COUNT_EVENT,
	X_SET_RESULT_EVENT,
	X_RANK_POSITION_EVENT,
] as const;

const EVENT_KINDS = [
	...SCOREBOARD_EVENT_KINDS,
	SCOREBOARD_OWN_EVENT,
	DEATH_EVENT,
	MAP_START_EVENT,
	MINIMAP_EVENT,
	OBJECTIVE_EVENT,
	PLAYER_STATUS_EVENT,
	STRIP_WEAPONS_EVENT,
	KILL_EVENT,
	...X_BATTLE_CARD_EVENT_KINDS,
] as const;

const KIND_BY_TYPE: ReadonlyMap<string, EventKind> = new Map(
	EVENT_KINDS.map((kind) => [kind.type, kind]),
);

/** One detected event: `type` discriminates `data`. */
export type DetectedEvent = EventOf<(typeof EVENT_KINDS)[number]>;

export type EventType = DetectedEvent["type"];

type EventByType = { [E in DetectedEvent as E["type"]]: E };

/** The `DetectedEvent` member(s) of the given type(s). */
export type EventOfType<TType extends EventType> = EventByType[TType];

export type ScoreboardFamilyEvent = EventOf<
	(typeof SCOREBOARD_EVENT_KINDS)[number]
>;

export type HistoryScoreboardEvent = EventOf<
	(typeof HISTORY_SCOREBOARD_EVENT_KINDS)[number]
>;

export type XBattleCardEvent = EventOf<
	(typeof X_BATTLE_CARD_EVENT_KINDS)[number]
>;

/**
 * The declared kind of an event type. Its data-taking members are typed for
 * unknown data: they are only ever called with the data of events of `type`.
 */
export function kindOf(type: string): EventKind | undefined {
	return KIND_BY_TYPE.get(type);
}

/** The detection alone, without whatever a record carries beside it (store ids, debug). */
export function detectionOf(event: DetectedEvent): DetectedEvent {
	const { type, t, confidence, data } = event;
	// `type` and `data` come from one member of the union
	return { type, t, confidence, data } as DetectedEvent;
}

/** Narrows an event to a type, also where `event.type === type` can't: on an event of a generic record type. */
export function isEventOfType<E extends DetectedEvent, TType extends EventType>(
	event: E,
	type: TType,
): event is E & EventOfType<TType> {
	return event.type === type;
}

/** Whether the event is a scoreboard of any screen (results, replay, battle log). */
export function isScoreboardEvent<E extends DetectedEvent>(
	event: E,
): event is E & ScoreboardFamilyEvent {
	return SCOREBOARD_EVENT_KINDS.some((kind) => kind.type === event.type);
}

/** Whether the event is a battle history screen (replay browser entry, battle log). */
export function isHistoryScoreboardEvent<E extends DetectedEvent>(
	event: E,
): event is E & HistoryScoreboardEvent {
	return HISTORY_SCOREBOARD_EVENT_KINDS.some(
		(kind) => kind.type === event.type,
	);
}

/** Whether the event is one of the X Battle lobby cards. */
export function isXBattleCardEvent<E extends DetectedEvent>(
	event: E,
): event is E & XBattleCardEvent {
	return X_BATTLE_CARD_EVENT_KINDS.some((kind) => kind.type === event.type);
}
