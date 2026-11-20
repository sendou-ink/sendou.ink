/**
 * Splits a timeline's gameplay into games ("segments"), before anything is
 * known about which results or history screen belongs to which. A segment is
 * one game's gameplay reads (intro, minimaps, deaths, counters, icon strip,
 * kill feed) followed by its tail: the lobby screens shown after it until the
 * next game's gameplay (results and history screens, the personal results
 * screen, the X Battle cards). A new segment starts at:
 *
 * - a map intro;
 * - gameplay after a lobby screen, unless the game clock runs on across the
 *   screen (a misread screen in the middle of a game ends nothing);
 * - the clock starting another game (`Clock.gameOpenings`): a game whose intro
 *   and results screen were both missed;
 * - a minimap stage change the next minimap does not refute, or a 5 min gap
 *   between minimaps (casts show no intro nor results screen).
 *
 * Which game a lobby screen shows is not decided here: the builder assigns
 * them (match-builder.ts).
 */
import * as R from "remeda";
import type { StageId } from "~/modules/in-game-lists/types";
import * as Clock from "./clock";
import { DEATH_EVENT_TYPE } from "./detectors/death/index";
import { KILL_EVENT_TYPE } from "./detectors/kill/index";
import { MAP_START_EVENT_TYPE } from "./detectors/map-start/index";
import { MINIMAP_EVENT_TYPE } from "./detectors/minimap/index";
import { OBJECTIVE_EVENT_TYPE } from "./detectors/objective/index";
import { PLAYER_STATUS_EVENT_TYPE } from "./detectors/objective/player-status";
import { STRIP_WEAPONS_EVENT_TYPE } from "./detectors/objective/strip-weapons";
import { SCOREBOARD_OWN_EVENT_TYPE } from "./detectors/scoreboard-own/index";
import {
	type DetectedEvent,
	type EventOfType,
	isEventOfType,
	isScoreboardEvent,
	isXBattleCardEvent,
	type ScoreboardFamilyEvent,
	type XBattleCardEvent,
} from "./events";

/** Minimaps further apart than this cannot be the same game, even on the same stage. */
const MATCH_GAP_SECONDS = 300;

const GAMEPLAY_EVENT_TYPES: ReadonlySet<string> = new Set([
	MINIMAP_EVENT_TYPE,
	DEATH_EVENT_TYPE,
	OBJECTIVE_EVENT_TYPE,
	PLAYER_STATUS_EVENT_TYPE,
	STRIP_WEAPONS_EVENT_TYPE,
	KILL_EVENT_TYPE,
]);

/** A screen shown between games: results and history screens, the personal results screen, the X Battle cards. */
type LobbyEvent =
	| ScoreboardFamilyEvent
	| EventOfType<typeof SCOREBOARD_OWN_EVENT_TYPE>
	| XBattleCardEvent;

export interface Segment<E extends DetectedEvent> {
	mapStart: (E & EventOfType<typeof MAP_START_EVENT_TYPE>) | null;
	minimaps: (E & EventOfType<typeof MINIMAP_EVENT_TYPE>)[];
	deaths: (E & EventOfType<typeof DEATH_EVENT_TYPE>)[];
	/** objective-counter reads */
	objectives: (E & EventOfType<typeof OBJECTIVE_EVENT_TYPE>)[];
	/** icon-strip reads */
	playerStatuses: (E & EventOfType<typeof PLAYER_STATUS_EVENT_TYPE>)[];
	/** sampled per-slot weapon evidence */
	stripWeapons: (E & EventOfType<typeof STRIP_WEAPONS_EVENT_TYPE>)[];
	/** kill-feed stack reads */
	kills: (E & EventOfType<typeof KILL_EVENT_TYPE>)[];
	/** the intro's and the minimaps' stages, counted */
	stageVotes: Map<StageId, number>;
	/** the first and the last gameplay read, the intro included */
	from: number;
	to: number;
	/** the lobby screens after the gameplay, until the next segment starts */
	tail: (E & LobbyEvent)[];
}

export interface Segmentation<E extends DetectedEvent> {
	segments: Segment<E>[];
	/** lobby screens before the first segment */
	leading: (E & LobbyEvent)[];
	/** lobby screens read while a game's clock ran on across them: misreads, part of no game */
	midGame: ReadonlySet<E>;
}

/** Splits time-sorted events into segments (see the module comment). */
export function split<E extends DetectedEvent>(
	sorted: readonly E[],
): Segmentation<E> {
	const clock = clockOf(sorted);
	const minimapLookahead = buildMinimapLookahead(sorted);
	const segments: OpenSegment<E>[] = [];
	const leading: (E & LobbyEvent)[] = [];
	const midGame = new Set<E>();

	let current: OpenSegment<E> | null = null;
	let ended = false;
	const start = (t: number): OpenSegment<E> => {
		const segment = openSegment<E>(t);
		segments.push(segment);
		return segment;
	};

	for (const [index, event] of sorted.entries()) {
		if (isLobbyEvent(event)) {
			if (!current) {
				leading.push(event);
				continue;
			}
			if (!ended && !clock.runsOnAcross(index)) ended = true;
			if (ended) current.tail.push(event);
			else midGame.add(event);
			continue;
		}
		if (isEventOfType(event, MAP_START_EVENT_TYPE)) {
			current = start(event.t);
			ended = false;
			current.mapStart = event;
			vote(current.stageVotes, event.data.stage);
			continue;
		}
		if (!isGameplayEvent(event)) continue;

		const opensGame =
			clock.spanOpenedBy(index) !== null && R.isNonNullish(current?.spanIndex);
		if (
			!current ||
			ended ||
			opensGame ||
			(isEventOfType(event, MINIMAP_EVENT_TYPE) &&
				minimapSplits(current, event, minimapLookahead.get(event)!))
		) {
			current = start(event.t);
			ended = false;
		}
		const segment = current;
		segment.to = event.t;
		const timedSpan = clock.spanOf(index);
		if (timedSpan !== null) segment.spanIndex = timedSpan;

		if (isEventOfType(event, MINIMAP_EVENT_TYPE)) {
			segment.minimaps.push(event);
			segment.lastMinimapT = event.t;
			vote(segment.stageVotes, event.data.stage);
		} else if (isEventOfType(event, DEATH_EVENT_TYPE)) {
			segment.deaths.push(event);
		} else if (isEventOfType(event, OBJECTIVE_EVENT_TYPE)) {
			segment.objectives.push(event);
		} else if (isEventOfType(event, PLAYER_STATUS_EVENT_TYPE)) {
			segment.playerStatuses.push(event);
		} else if (isEventOfType(event, STRIP_WEAPONS_EVENT_TYPE)) {
			segment.stripWeapons.push(event);
		} else if (isEventOfType(event, KILL_EVENT_TYPE)) {
			segment.kills.push(event);
		}
	}

	return {
		segments: segments.map(
			({ lastMinimapT: _, spanIndex: __, ...segment }) => segment,
		),
		leading,
		midGame,
	};
}

/** Plurality stage of the votes; insertion order breaks ties. */
export function leadingStage(votes: Map<StageId, number>): StageId | null {
	let winner: StageId | null = null;
	let best = 0;
	for (const [stage, count] of votes) {
		if (count > best) {
			winner = stage;
			best = count;
		}
	}
	return winner;
}

/** Adds a stage read to the votes; an unread one counts for nothing. */
export function vote(votes: Map<StageId, number>, stage: StageId | null): void {
	if (stage !== null) votes.set(stage, (votes.get(stage) ?? 0) + 1);
}

interface OpenSegment<E extends DetectedEvent> extends Segment<E> {
	lastMinimapT: number | null;
	/** the clock span of the segment's last timed read */
	spanIndex: number | null;
}

function openSegment<E extends DetectedEvent>(t: number): OpenSegment<E> {
	return {
		lastMinimapT: null,
		spanIndex: null,
		mapStart: null,
		minimaps: [],
		deaths: [],
		objectives: [],
		playerStatuses: [],
		stripWeapons: [],
		kills: [],
		stageVotes: new Map(),
		from: t,
		to: t,
		tail: [],
	};
}

function isLobbyEvent<E extends DetectedEvent>(
	event: E,
): event is E & LobbyEvent {
	return (
		isScoreboardEvent(event) ||
		isEventOfType(event, SCOREBOARD_OWN_EVENT_TYPE) ||
		isXBattleCardEvent(event)
	);
}

function isGameplayEvent(event: DetectedEvent): boolean {
	return GAMEPLAY_EVENT_TYPES.has(event.type);
}

/** The timer a gameplay read shows; null for reads with none (deaths, minimaps) or an unread one. */
function timerOf(event: DetectedEvent): number | null {
	if (
		isEventOfType(event, OBJECTIVE_EVENT_TYPE) ||
		isEventOfType(event, PLAYER_STATUS_EVENT_TYPE) ||
		isEventOfType(event, KILL_EVENT_TYPE)
	) {
		return event.data.time;
	}
	return null;
}

/**
 * The game clock over the whole scan, asked per event index: which span a
 * timed read is on, whether it is the first read of a span opening a game, and
 * whether the clock runs on across a lobby screen (the timed reads either side
 * of it on one span's anchor).
 */
function clockOf(sorted: readonly DetectedEvent[]) {
	const timed = sorted.flatMap((event, index) => {
		const time = timerOf(event);
		return time === null ? [] : [{ index, t: event.t, time }];
	});
	const spans = Clock.track(timed);
	const spanOfIndex = new Map<number, number>();
	const onAnchor = new Set<number>();
	let spanIndex = 0;
	for (const read of timed) {
		while (spanIndex < spans.length && spans[spanIndex]!.to < read.t) {
			spanIndex++;
		}
		const span = spans[spanIndex];
		if (!span || span.from > read.t) continue;
		spanOfIndex.set(read.index, spanIndex);
		if (Clock.position(spans, read).time === read.time)
			onAnchor.add(read.index);
	}
	const openingIndices = new Set<number>();
	const openings = Clock.gameOpenings(spans);
	for (const [i, span] of spans.entries()) {
		if (!openings[i]) continue;
		const first = timed.find((read) => read.t === span.from);
		if (first) openingIndices.add(first.index);
	}

	return {
		spanOf: (index: number): number | null => spanOfIndex.get(index) ?? null,
		spanOpenedBy: (index: number): number | null =>
			openingIndices.has(index) ? spanOfIndex.get(index)! : null,
		runsOnAcross: (index: number): boolean => {
			const afterPosition = firstPositionAfter(timed, index);
			const before = timed[afterPosition - 1];
			const after = timed[afterPosition];
			if (!before || !after) return false;
			if (!onAnchor.has(before.index) || !onAnchor.has(after.index)) {
				return false;
			}
			return spanOfIndex.get(before.index) === spanOfIndex.get(after.index);
		},
	};
}

/** The position of the first read after event `index`, by binary search over reads in event order. */
function firstPositionAfter(
	reads: readonly { index: number }[],
	index: number,
): number {
	let low = 0;
	let high = reads.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (reads[middle]!.index > index) high = middle;
		else low = middle + 1;
	}
	return low;
}

/**
 * A stage change splits only when the next minimap doesn't refute it: a lone
 * disagreeing frame is a misread folded in as a minority vote. An intro's
 * stage outranks minimap reads: it holds until no later minimap of this game
 * shows it again (the next game's intro was missed).
 */
function minimapSplits<E extends DetectedEvent>(
	segment: OpenSegment<E>,
	event: EventOfType<typeof MINIMAP_EVENT_TYPE>,
	lookahead: MinimapLookahead,
): boolean {
	const stage = event.data.stage;
	const introStage = segment.mapStart?.data.stage ?? null;
	const current = introStage ?? leadingStage(segment.stageVotes);
	const stageChanged =
		current !== null &&
		stage !== null &&
		stage !== current &&
		(lookahead.nextStage ?? stage) === stage &&
		(introStage === null || !lookahead.laterStages.has(introStage));
	const gapTooBig =
		segment.lastMinimapT !== null &&
		event.t - segment.lastMinimapT > MATCH_GAP_SECONDS;
	return stageChanged || gapTooBig;
}

interface MinimapLookahead {
	/** the next minimap's non-null stage read */
	nextStage: StageId | null;
	/** stages read by later minimaps before the next intro, scoreboard or time gap */
	laterStages: ReadonlySet<StageId>;
}

/**
 * For each minimap event, what the minimaps after it read — the refutation
 * signals for the stage-change split.
 */
function buildMinimapLookahead<E extends DetectedEvent>(
	sorted: readonly E[],
): Map<E, MinimapLookahead> {
	const lookahead = new Map<E, MinimapLookahead>();
	let nextStage: StageId | null = null;
	let laterStages = new Set<StageId>();
	let laterMinimapT: number | null = null;
	for (let i = sorted.length - 1; i >= 0; i--) {
		const event = sorted[i]!;
		if (event.type === MAP_START_EVENT_TYPE || isScoreboardEvent(event)) {
			laterStages = new Set();
			continue;
		}
		if (!isEventOfType(event, MINIMAP_EVENT_TYPE)) continue;
		if (laterMinimapT !== null && laterMinimapT - event.t > MATCH_GAP_SECONDS) {
			laterStages = new Set();
		}
		lookahead.set(event, { nextStage, laterStages });
		const stage = event.data.stage;
		if (stage !== null && !laterStages.has(stage)) {
			// copied so the sets already handed out keep what they saw
			laterStages = new Set(laterStages).add(stage);
		}
		nextStage = stage ?? nextStage;
		laterMinimapT = event.t;
	}
	return lookahead;
}
