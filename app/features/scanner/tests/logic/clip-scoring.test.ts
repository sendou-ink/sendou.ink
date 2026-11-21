/**
 * Tests for the clip windows: which kills group into a streak, what ends
 * one, the clip length cap and the score that ranks them.
 */

import assert from "node:assert/strict";
import {
	clipCovers,
	povDeathTimes,
	scoreWindows,
	streakGame,
	windowClosed,
} from "../../core/clips/scoring";
import { DEATH_EVENT_TYPE } from "../../core/detectors/death/index";
import { MINIMAP_EVENT_TYPE } from "../../core/detectors/minimap/index";
import type {
	ScannerMatch,
	ScannerMatchKill,
	ScannerMatchPlayerStatusSample,
} from "../../core/scanner-match";
import { test } from "../node-test-compat";
import { stubEvent } from "../stub-event";

function kill(t: number, time: number | null = null): ScannerMatchKill {
	return { t, time, name: null };
}

const kills = (...ts: number[]) => ({ kills: ts.map((t) => kill(t)) });

/** the live setting's default streak length unless a test picks its own */
const windowsOf = (
	match: Parameters<typeof scoreWindows>[0],
	deaths: readonly number[],
	options: Partial<Parameters<typeof scoreWindows>[2]> = {},
) => scoreWindows(match, deaths, { minKills: 4, ...options });

const windowOf = (start: number, end: number, count: number, t: number) => ({
	start,
	end,
	kills: count,
	t,
});

/** the timing fields alone; time and score have their own tests */
function stripped(windows: ReturnType<typeof scoreWindows>) {
	return windows.map(({ start, end, kills: count, t }) => ({
		start,
		end,
		kills: count,
		t,
	}));
}

test("no window below the kill threshold", () => {
	assert.deepEqual(windowsOf(kills(100, 105, 110), []), []);
	assert.deepEqual(
		stripped(windowsOf(kills(100, 105, 110), [], { minKills: 3 })),
		[windowOf(95, 113, 3, 110)],
	);
});

test("a run of close kills is one window with lead and tail", () => {
	assert.deepEqual(stripped(windowsOf(kills(100, 110, 125, 130), [])), [
		windowOf(95, 133, 4, 130),
	]);
});

test("the clip start clamps to the stream start", () => {
	assert.deepEqual(stripped(windowsOf(kills(2, 4, 6, 8), [])), [
		windowOf(0, 11, 4, 8),
	]);
});

test("a long pause splits the streak", () => {
	assert.deepEqual(
		stripped(windowsOf(kills(100, 105, 110, 115, 140, 145, 150, 155), [])),
		[windowOf(95, 118, 4, 115), windowOf(135, 158, 4, 155)],
	);
});

test("a death between two kills ends the streak", () => {
	assert.deepEqual(windowsOf(kills(100, 105, 110, 115), [107.5]), []);
	assert.deepEqual(stripped(windowsOf(kills(100, 105, 110, 115, 120), [116])), [
		windowOf(95, 118, 4, 115),
	]);
});

test("a death on a kill's second (a trade) counts after that kill", () => {
	assert.deepEqual(stripped(windowsOf(kills(100, 105, 110, 115), [115])), [
		windowOf(95, 118, 4, 115),
	]);
});

test("a streak is cut where its clip would outgrow the cap", () => {
	assert.deepEqual(
		stripped(
			windowsOf(kills(100, 115, 130, 145, 160, 175, 190, 205, 220), [], {
				maxSeconds: 60,
			}),
		),
		[windowOf(95, 148, 4, 145), windowOf(155, 208, 4, 205)],
	);
});

test("the score ranks the longer streak first, the tighter one second", () => {
	const [loose] = windowsOf(kills(100, 110, 120, 130), []);
	const [tight] = windowsOf(kills(100, 102, 104, 106), []);
	const [longer] = windowsOf(kills(100, 110, 120, 130, 140), []);
	assert.ok(tight!.score > loose!.score);
	assert.ok(longer!.score > tight!.score);
});

test("the window carries its last kill's timer reading", () => {
	const [window] = windowsOf(
		{ kills: [kill(100, 200), kill(103, 197), kill(106, 194), kill(109, 191)] },
		[],
	);
	assert.equal(window!.time, 191);
});

test("a window closes once the streak gap has passed its last kill", () => {
	const [window] = windowsOf(kills(100, 105, 110, 115), []);
	assert.equal(windowClosed(window!, 129), false);
	assert.equal(windowClosed(window!, 130), true);
});

test("clipCovers is inclusive of both ends", () => {
	assert.equal(clipCovers({ start: 95, end: 119 }, 95), true);
	assert.equal(clipCovers({ start: 95, end: 119 }, 119), true);
	assert.equal(clipCovers({ start: 95, end: 119 }, 120), false);
});

function minimapRead(t: number, cards: { self: boolean; dead: boolean }[]) {
	return stubEvent({
		type: MINIMAP_EVENT_TYPE,
		t,
		scores: { read: 1 },
		data: {
			teammates: cards.map((card) => ({ ...card, specialReady: false })),
		},
	});
}

test("a minimap read striking out the POV card is a POV death", () => {
	const events = [
		stubEvent({ type: DEATH_EVENT_TYPE, t: 50, scores: { read: 1 }, data: {} }),
		minimapRead(107, [
			{ self: true, dead: true },
			{ self: false, dead: false },
		]),
		minimapRead(120, [
			{ self: true, dead: false },
			{ self: false, dead: true },
		]),
	];
	assert.deepEqual(povDeathTimes(events), [50, 107]);
	assert.deepEqual(
		windowsOf(kills(100, 105, 110, 115), povDeathTimes(events)),
		[],
	);
});

const seat = (team: 0 | 1, index: number) => ({ team, index });

test("kills credited to two players are two streaks", () => {
	const credited = {
		kills: [100, 104, 108, 112, 116, 120, 124, 128].map((t, i) => ({
			...kill(t),
			player: seat(0, i < 4 ? 1 : 2),
		})),
	};
	const windows = scoreWindows(credited, [], { minKills: 4 });
	assert.deepEqual(stripped(windows), [
		windowOf(95, 115, 4, 112),
		windowOf(111, 131, 4, 128),
	]);
	assert.deepEqual(
		windows.map((window) => window.player),
		[seat(0, 1), seat(0, 2)],
	);
});

test("a cast's camera leaving the player between two kills ends the streak", () => {
	const camera = [
		{ t: 101, seat: seat(0, 1) },
		{ t: 110, seat: seat(1, 3) },
		{ t: 112, seat: seat(0, 1) },
	];
	assert.deepEqual(
		scoreWindows({ ...kills(100, 104, 108, 114, 118, 122), camera }, [], {
			minKills: 3,
		}).map((window) => window.killTimes),
		[
			[100, 104, 108],
			[114, 118, 122],
		],
	);
});

test("a kill whose player is unknown joins the streak around it", () => {
	const credited = {
		kills: [
			{ ...kill(100), player: seat(0, 1) },
			{ ...kill(104), player: null },
			{ ...kill(108), player: seat(0, 1) },
			{ ...kill(112), player: seat(0, 1) },
		],
	};
	assert.deepEqual(stripped(scoreWindows(credited, [], { minKills: 4 })), [
		windowOf(95, 115, 4, 112),
	]);
});

test("a cast's streak game credits kills to the camera's player and counts their splats", () => {
	const sample = (
		t: number,
		spectated: ReturnType<typeof seat> | null,
		deadSlot: number | null = null,
	): ScannerMatchPlayerStatusSample => ({
		t,
		time: null,
		special: [
			[false, false, false, false],
			[false, false, false, false],
		],
		dead: [
			[0, 1, 2, 3].map((slot) => slot === deadSlot) as [
				boolean,
				boolean,
				boolean,
				boolean,
			],
			[false, false, false, false],
		],
		spectated,
	});
	const match = {
		cast: true,
		pov: null,
		kills: [kill(100), kill(130)],
		playerStatus: {
			samples: [
				sample(99, seat(0, 2)),
				sample(110, seat(0, 2), 2),
				sample(120, null),
				sample(129, seat(0, 1)),
			],
		},
	} as unknown as ScannerMatch;

	const game = streakGame({ match, sources: [] });

	assert.deepEqual(
		game.kills?.map((credited) => credited.player),
		[seat(0, 2), seat(0, 1)],
	);
	assert.deepEqual(game.deaths, [110]);
	assert.deepEqual(
		game.camera?.map((read) => read.t),
		[99, 110, 129],
	);
});

test("a kill whose player is unknown never bridges two players' streaks", () => {
	const credited = {
		kills: [
			{ ...kill(100), player: seat(0, 1) },
			{ ...kill(104), player: seat(0, 1) },
			{ ...kill(108), player: null },
			{ ...kill(112), player: seat(0, 2) },
			{ ...kill(116), player: seat(0, 2) },
		],
	};
	assert.deepEqual(
		scoreWindows(credited, [], { minKills: 2 }).map((window) => ({
			killTimes: window.killTimes,
			player: window.player,
		})),
		[
			{ killTimes: [100, 104, 108], player: seat(0, 1) },
			{ killTimes: [112, 116], player: seat(0, 2) },
		],
	);
});
