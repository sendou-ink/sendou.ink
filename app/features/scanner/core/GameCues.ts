/**
 * Game starts and ends as a broadcast cuts to them, off the detector events
 * as they come in (before the timeline merges them, which would delay them).
 * A game starts once the HUD's player icons show both teams' ink hues twice
 * in a row, in every mode, so the overlay knows the colors before cutting to
 * it (their RGB, which tells pairs of about the same hue apart); the intro
 * splash comes earlier but carries no ink. A game ends once
 * its HUD is gone: shortly after the timer ran out, or a while longer
 * without, as a knockout's 0 is gone before it's read (and a blurred 100
 * reads as 0, so the counter can't tell). An observer opening the map hides
 * the HUD too, which keeps the game on while it's up.
 */

import { MAP_START_EVENT_TYPE } from "./detectors/map-start/index";
import {
	OBJECTIVE_EVENT_TYPE,
	type ObjectiveData,
} from "./detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	type PlayerStatusData,
} from "./detectors/objective/player-status";
import type { DetectedEvent } from "./detectors/types";
import { hueDistance, type InkRgb } from "./ink-color";

// xxx: define exactly when to switch on game start (HUD "Ready?" vs intro) and on game end ("GAME!" vs results) after hearing from Ely
/** HUD reads with both teams' ink agreeing it takes for the game to start, the HUD fading in reads off at first. */
const INK_READS_NEEDED = 2;
/** Two reads of the same teams: their hues summed over both sides this close, in either order (a cast's POV switch flips the sides). */
const SAME_INK_MAX_HUE_DISTANCE = 30;
/** HUD reads after which a game whose ink reads never agreed starts without colors rather than not at all. */
const HUD_READS_WITHOUT_INK = 6;
/** Seconds the HUD is gone after the timer ran out before the game counts as ended, it blinks out now and then. */
const HUD_GONE_SECONDS = 3;
/**
 * Seconds the HUD is gone before the game counts as ended without the timer running out, i.e. a knockout. Over
 * cast VoDs the HUD went unread mid-game for at most 3s, a knockout's "GAME!" and results for 25s or more.
 */
const HUD_GONE_SECONDS_WITHOUT_TIME_UP = 6;
/** A timer read this low ran out: the last second or two can be missed between reads. */
const TIME_UP_MAX_SECONDS = 1;
/** The read before it this low too, so one misread digit doesn't run the timer out mid-game. */
const TIME_UP_PREVIOUS_MAX_SECONDS = 10;

export type GameCue =
	| {
			type: "start";
			/** Both teams' ink colors, left side first as last read. `null` when they couldn't be read. */
			inks: [InkRgb, InkRgb] | null;
	  }
	| {
			type: "end";
			/** When the game's HUD was last read, in event time. */
			t: number;
	  };

export interface GameCuesState {
	isLive: boolean;
	/** Agreeing reads of both teams' ink while the game hasn't started, newest last. */
	inkReads: InkRead[];
	/** Reads of the game's HUD while it hasn't started. */
	hudReads: number;
	/** When the HUD (or the map an observer opened over it) was last seen, `null` before the game's first read. */
	lastHudAt: number | null;
	/** The timer's last read and the one of the frame before it, seconds. */
	lastTime: { t: number; time: number; before: number | null } | null;
	/** The timer ran out: the HUD going away soon after ends the game. */
	isTimeUp: boolean;
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

/** State before anything was read: no game on. */
export function initialState(): GameCuesState {
	return {
		isLive: false,
		inkReads: [],
		hudReads: 0,
		lastHudAt: null,
		lastTime: null,
		isTimeUp: false,
	};
}

/** Moves the state along with an event or time passing, along with the cues it gives. */
export function step(
	state: GameCuesState,
	input: GameCuesInput,
): { state: GameCuesState; cues: GameCue[] } {
	if (input.kind === "tick") return endIfHudGone(state, input.t);
	if (input.kind === "mapOpen") {
		return {
			state: state.isLive ? { ...state, lastHudAt: input.t } : state,
			cues: [],
		};
	}

	const { event } = input;
	if (event.type === MAP_START_EVENT_TYPE) {
		return { state: initialState(), cues: [] };
	}

	const ended = endIfHudGone(state, event.t);
	if (ended.cues.length > 0) return ended;

	if (event.type === OBJECTIVE_EVENT_TYPE) {
		return readObjective(state, event as DetectedEvent<ObjectiveData>);
	}
	if (event.type === PLAYER_STATUS_EVENT_TYPE) {
		return readHud(state, event as DetectedEvent<PlayerStatusData>);
	}

	return { state, cues: [] };
}

function readObjective(
	state: GameCuesState,
	event: DetectedEvent<ObjectiveData>,
): { state: GameCuesState; cues: GameCue[] } {
	return { state: readTime(state, event.t, event.data.time), cues: [] };
}

function readHud(
	state: GameCuesState,
	event: DetectedEvent<PlayerStatusData>,
): { state: GameCuesState; cues: GameCue[] } {
	const { time, teamHue, teamInk } = event.data;
	const read = readTime(state, event.t, time);
	if (state.isLive) return { state: read, cues: [] };

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
		return start(read, inkRead.inks);
	}

	const hudReads = state.hudReads + 1;
	if (hudReads >= HUD_READS_WITHOUT_INK) return start(read, null);

	return { state: { ...read, inkReads, hudReads }, cues: [] };
}

function start(
	state: GameCuesState,
	inks: [InkRgb, InkRgb] | null,
): { state: GameCuesState; cues: GameCue[] } {
	return {
		state: { ...state, isLive: true, inkReads: [], hudReads: 0 },
		cues: [{ type: "start", inks }],
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

function endIfHudGone(
	state: GameCuesState,
	t: number,
): { state: GameCuesState; cues: GameCue[] } {
	const goneSeconds = state.isTimeUp
		? HUD_GONE_SECONDS
		: HUD_GONE_SECONDS_WITHOUT_TIME_UP;
	if (
		!state.isLive ||
		state.lastHudAt === null ||
		t - state.lastHudAt < goneSeconds
	) {
		return { state, cues: [] };
	}

	return {
		state: initialState(),
		cues: [{ type: "end", t: state.lastHudAt }],
	};
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
