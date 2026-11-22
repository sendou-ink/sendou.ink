/**
 * Game starts and ends as a broadcast cuts to them, off the detector events
 * as they come in (before the timeline merges them, which would delay them).
 * Each cue carries the moment the cut belongs at, in event time, so a
 * broadcast running a stream delay can land it there (see broadcast's
 * `Producer.applyGameSignal`). A game starts with its intro splash, the
 * first thing of it shown; the teams' ink follows once the HUD's player
 * icons show both teams' hues twice in a row (their RGB, which tells pairs of
 * about the same hue apart). Without an intro read the HUD starts the game,
 * ink and all. A game ends once its HUD is gone: shortly after the timer ran
 * out (overtime keeps the HUD up), or a while longer without, as a knockout's
 * 0 is gone before it's read (and a blurred 100 reads as 0, so the counter
 * can't tell). The cut belongs at the HUD's last read either way. An observer
 * opening the map hides the HUD too, which keeps the game on while it's up.
 * An intro read after the game's HUD showed starts the next game right away
 * (a replay watched again, or seeked back to its start), and so does the game
 * clock jumping back up, which only counts down within a game (the next game
 * shown with its intro missed): the game before it gets no end then.
 *
 * A game ends once per moment of its end (`GAME_END_TRIGGERS`), each `end`
 * cue naming its own, the broadcast cutting away at the one it waits for
 * (Judd's flag). The HUD going away is always the first; the
 * results screen follows it, Judd raising the flag for the winner 8-11s after
 * the HUD's last read on cast VoDs. A flag read without the HUD gone a moment
 * is no results screen, and one never read (a missed read, the cast cutting
 * away) is given up on a while after, so a broadcast waiting for it never gets
 * stuck on the game.
 */

import { JUDD_FLAG_EVENT_TYPE } from "./detectors/judd/index";
import { MAP_START_EVENT_TYPE } from "./detectors/map-start/index";
import { OBJECTIVE_EVENT_TYPE } from "./detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	type PlayerStatusData,
	type PlayerStatusEvent,
} from "./detectors/objective/player-status";
import type { DetectedEvent } from "./events";
import { hueDistance, type InkRgb } from "./ink-color";

/** HUD reads with both teams' ink agreeing it takes for the ink to be known, the HUD fading in reads off at first. */
const INK_READS_NEEDED = 2;
/** Two reads of the same teams: their hues summed over both sides this close, in either order (a cast's POV switch flips the sides). */
const SAME_INK_MAX_HUE_DISTANCE = 30;
/** HUD reads after which a game whose ink reads never agreed goes on without colors rather than not at all. */
const HUD_READS_WITHOUT_INK = 6;
/** Seconds the HUD is gone after the timer ran out before the game counts as ended, it blinks out now and then. */
const HUD_GONE_SECONDS = 3;
/**
 * Seconds the HUD is gone before the game counts as ended without the timer running out, i.e. a knockout. Over
 * cast VoDs the HUD went unread mid-game for at most 3s, a knockout's "GAME!" and results for 25s or more.
 */
const HUD_GONE_SECONDS_WITHOUT_TIME_UP = 6;
/** Seconds after the HUD's last read Judd's flag is given up on, the flag ending the game then. */
const JUDD_FLAG_MAX_SECONDS = 16;
/** Seconds the HUD is gone at least when Judd's flag shows, a flag read with the HUD only just gone is a misread. */
const JUDD_FLAG_MIN_HUD_GONE_SECONDS = 2;
/** Seconds after the intro splash its game's HUD shows up at the latest, an intro misread is taken back after it. */
const INTRO_MAX_SECONDS = 30;
/** A timer read this low ran out: the last second or two can be missed between reads. */
const TIME_UP_MAX_SECONDS = 1;
/** The read before it this low too, so one misread digit doesn't run the timer out mid-game. */
const TIME_UP_PREVIOUS_MAX_SECONDS = 10;
/** A timer read this much higher than the game's last one is another game's clock, the timer only counting down. */
const CLOCK_JUMP_MIN_SECONDS = 10;

/** The moments a game's end is cued at, in the order they come: its HUD going away, Judd raising the flag. */
const GAME_END_TRIGGERS = ["hudGone", "juddFlag"] as const;

type GameEndTrigger = (typeof GAME_END_TRIGGERS)[number];

export type GameCue =
	| {
			type: "start";
			/** When the game was first seen, in event time: where the cut to it belongs. */
			t: number;
			/** Both teams' ink colors, left side first as last read. `null` when not read (yet, see the `ink` cue). */
			inks: [InkRgb, InkRgb] | null;
	  }
	| {
			/** The ink of a game that started off its intro, once the HUD shows it. */
			type: "ink";
			inks: [InkRgb, InkRgb];
	  }
	| {
			type: "end";
			/** Which moment of the end this is, every game ending once per trigger. */
			trigger: GameEndTrigger;
			/**
			 * When it happened, in event time: where the cut away from the game belongs. The HUD's last read, the flag's
			 * first, or when the flag was given up on.
			 */
			t: number;
			/** The timer ran out before the HUD went away, otherwise it was a knockout. */
			isTimeUp: boolean;
	  };

export interface GameCuesState {
	/** When the game on started, in event time (see the `start` cue's `t`), `null` while none is. */
	startedAt: number | null;
	/** The game's ink was told (or given up on), so the HUD reads stop looking for it. */
	isInkSettled: boolean;
	/** Agreeing reads of both teams' ink while it isn't settled, newest last. */
	inkReads: InkRead[];
	/** Reads of the game's HUD while its ink isn't settled. */
	hudReads: number;
	/** When the HUD (or the map an observer opened over it) was last seen, `null` before the game's first read. */
	lastHudAt: number | null;
	/** The timer's last read and the one of the frame before it, seconds. */
	lastTime: { t: number; time: number; before: number | null } | null;
	/** The timer ran out: the HUD going away soon after ends the game. */
	isTimeUp: boolean;
	/** The game that ended last, while its Judd flag is still to come: when its HUD was last read. */
	flagAwaited: { hudGoneAt: number; isTimeUp: boolean } | null;
}

interface InkRead {
	hues: [number, number];
	inks: [InkRgb, InkRgb];
}

export type GameCuesInput =
	| { kind: "event"; event: DetectedEvent }
	/** The map overlay is up, hiding the HUD (its gate passed, which keeps passing after its one read). */
	| { kind: "mapOpen"; t: number }
	/** Time passing without events, in event time: what ends a game. */
	| { kind: "tick"; t: number };

type Stepped = { state: GameCuesState; cues: GameCue[] };

/** State before anything was read: no game on. */
export function initialState(): GameCuesState {
	return {
		startedAt: null,
		isInkSettled: false,
		inkReads: [],
		hudReads: 0,
		lastHudAt: null,
		lastTime: null,
		isTimeUp: false,
		flagAwaited: null,
	};
}

/** Moves the state along with an event or time passing, along with the cues it gives. */
export function step(state: GameCuesState, input: GameCuesInput): Stepped {
	if (input.kind === "tick") return endIfOver(state, input.t);
	if (input.kind === "mapOpen") {
		return {
			state: isLive(state) ? { ...state, lastHudAt: input.t } : state,
			cues: [],
		};
	}

	const { event } = input;
	const ended = endIfOver(state, event.t);
	const restarted = restartOnClockJump(ended.state, event);
	const read = readEvent(restarted.state, event);

	return {
		state: read.state,
		cues: [...ended.cues, ...restarted.cues, ...read.cues],
	};
}

/** The game clock read higher than the game's last read: the next game is on, started where this read was. */
function restartOnClockJump(
	state: GameCuesState,
	event: DetectedEvent,
): Stepped {
	const time =
		event.type === OBJECTIVE_EVENT_TYPE ||
		event.type === PLAYER_STATUS_EVENT_TYPE
			? event.data.time
			: null;
	if (
		!isLive(state) ||
		time === null ||
		state.lastTime === null ||
		time - state.lastTime.time < CLOCK_JUMP_MIN_SECONDS
	) {
		return { state, cues: [] };
	}

	return {
		state: { ...initialState(), startedAt: event.t },
		cues: [{ type: "start", t: event.t, inks: null }],
	};
}

function readEvent(state: GameCuesState, event: DetectedEvent): Stepped {
	if (event.type === MAP_START_EVENT_TYPE) return readIntro(state, event.t);
	if (event.type === JUDD_FLAG_EVENT_TYPE) return readFlag(state, event.t);
	if (event.type === OBJECTIVE_EVENT_TYPE) {
		return { state: readTime(state, event.t, event.data.time), cues: [] };
	}
	if (event.type === PLAYER_STATUS_EVENT_TYPE) {
		return readHud(state, event);
	}

	return { state, cues: [] };
}

function isLive(state: GameCuesState) {
	return state.startedAt !== null;
}

/** The intro splash starts its game. Read before the game's HUD showed, it's the same intro read again. */
function readIntro(state: GameCuesState, t: number): Stepped {
	if (isLive(state) && state.lastHudAt === null) return { state, cues: [] };

	return {
		state: { ...initialState(), startedAt: t },
		cues: [...flagGivenUp(state, t, true), { type: "start", t, inks: null }],
	};
}

/**
 * Judd's flag ends the game that ended last. Read with the game still on, it ends the game with its HUD gone long
 * enough, a moment earlier than the HUD going away would.
 */
function readFlag(state: GameCuesState, t: number): Stepped {
	if (state.flagAwaited) {
		return {
			state: { ...state, flagAwaited: null },
			cues: [
				{
					type: "end",
					trigger: "juddFlag",
					t,
					isTimeUp: state.flagAwaited.isTimeUp,
				},
			],
		};
	}

	if (
		state.lastHudAt === null ||
		t - state.lastHudAt < JUDD_FLAG_MIN_HUD_GONE_SECONDS
	) {
		return { state, cues: [] };
	}

	const ended = hudGone(state, state.lastHudAt);
	const flagged = readFlag(ended.state, t);
	return { state: flagged.state, cues: [...ended.cues, ...flagged.cues] };
}

function readHud(state: GameCuesState, event: PlayerStatusEvent): Stepped {
	const { time, teamHue, teamInk } = event.data;
	const read = readTime(state, event.t, time);
	if (state.isInkSettled) return { state: read, cues: [] };

	const inkRead = toInkRead(teamHue, teamInk);
	const previous = state.inkReads.at(-1);
	const inkReads: InkRead[] = inkRead
		? [
				...(previous && isSameInk(previous.hues, inkRead.hues)
					? state.inkReads
					: []),
				inkRead,
			]
		: [];
	if (inkRead && inkReads.length >= INK_READS_NEEDED) {
		return settleInk(read, event.t, inkRead.inks);
	}

	const hudReads = state.hudReads + 1;
	if (hudReads >= HUD_READS_WITHOUT_INK) return settleInk(read, event.t, null);

	return { state: { ...read, inkReads, hudReads }, cues: [] };
}

/** The ink is known (or given up on): told with an `ink` cue, or starting the game when no intro started it. */
function settleInk(
	state: GameCuesState,
	t: number,
	inks: [InkRgb, InkRgb] | null,
): Stepped {
	const settled: GameCuesState = {
		...state,
		isInkSettled: true,
		inkReads: [],
		hudReads: 0,
	};
	if (isLive(state)) {
		return { state: settled, cues: inks ? [{ type: "ink", inks }] : [] };
	}

	return {
		state: { ...settled, startedAt: t, flagAwaited: null },
		cues: [...flagGivenUp(state, t, true), { type: "start", t, inks }],
	};
}

function readTime(
	state: GameCuesState,
	t: number,
	time: number | null,
): GameCuesState {
	if (time === null) return { ...state, lastHudAt: t };

	// the counter and the icon strip of one frame carry the same read
	const before =
		state.lastTime?.t === t
			? state.lastTime.before
			: (state.lastTime?.time ?? null);

	return {
		...state,
		lastHudAt: t,
		lastTime: { t, time, before },
		isTimeUp:
			state.isTimeUp ||
			(time <= TIME_UP_MAX_SECONDS &&
				before !== null &&
				before <= TIME_UP_PREVIOUS_MAX_SECONDS),
	};
}

/**
 * Ends the game once its HUD has been gone long enough, or its HUD never showed after the intro (a misread one, which
 * has no results screen to wait for). Gives up on the flag of the game that ended last once it's long overdue.
 */
function endIfOver(state: GameCuesState, t: number): Stepped {
	if (state.startedAt === null) {
		const cues = flagGivenUp(state, t);
		return cues.length > 0
			? { state: { ...state, flagAwaited: null }, cues }
			: { state, cues };
	}

	if (state.lastHudAt === null) {
		return t - state.startedAt < INTRO_MAX_SECONDS
			? { state, cues: [] }
			: {
					state: initialState(),
					cues: [
						{
							type: "end",
							trigger: "hudGone",
							t: state.startedAt,
							isTimeUp: false,
						},
					],
				};
	}

	const goneSeconds = state.isTimeUp
		? HUD_GONE_SECONDS
		: HUD_GONE_SECONDS_WITHOUT_TIME_UP;
	if (t - state.lastHudAt < goneSeconds) return { state, cues: [] };

	return hudGone(state, state.lastHudAt);
}

/** The game ends with its HUD gone since `hudGoneAt`, its flag awaited. */
function hudGone(state: GameCuesState, hudGoneAt: number): Stepped {
	return {
		state: {
			...initialState(),
			flagAwaited: { hudGoneAt, isTimeUp: state.isTimeUp },
		},
		cues: [
			{
				type: "end",
				trigger: "hudGone",
				t: hudGoneAt,
				isTimeUp: state.isTimeUp,
			},
		],
	};
}

/** The awaited flag's end, given up on: once overdue, or at the latest as the next game starts at `t`. */
function flagGivenUp(
	state: GameCuesState,
	t: number,
	isNextGameStarting = false,
): GameCue[] {
	const { flagAwaited } = state;
	if (!flagAwaited) return [];

	const overdueAt = flagAwaited.hudGoneAt + JUDD_FLAG_MAX_SECONDS;
	if (t < overdueAt && !isNextGameStarting) return [];

	return [
		{
			type: "end",
			trigger: "juddFlag",
			t: Math.min(t, overdueAt),
			isTimeUp: flagAwaited.isTimeUp,
		},
	];
}

function toInkRead(
	[leftHue, rightHue]: PlayerStatusData["teamHue"],
	[leftInk, rightInk]: PlayerStatusData["teamInk"],
): InkRead | null {
	if (
		leftHue === null ||
		rightHue === null ||
		leftInk === null ||
		rightInk === null
	) {
		return null;
	}

	return { hues: [leftHue, rightHue], inks: [leftInk, rightInk] };
}

function isSameInk(a: [number, number], b: [number, number]) {
	return (
		Math.min(
			hueDistance(a[0], b[0]) + hueDistance(a[1], b[1]),
			hueDistance(a[0], b[1]) + hueDistance(a[1], b[0]),
		) <= SAME_INK_MAX_HUE_DISTANCE
	);
}
