/**
 * Tests for the clip windows: which kills group into a streak, what ends
 * one, the clip length cap and the score that ranks them.
 */

import assert from "node:assert/strict";
import {
	clipCovers,
	povDeathTimes,
	scoreWindows,
	windowClosed,
} from "../../core/clips/scoring";
import { DEATH_EVENT_TYPE } from "../../core/detectors/death/index";
import { MINIMAP_EVENT_TYPE } from "../../core/detectors/minimap/index";
import type { ScannerMatchKill } from "../../core/scanner-match";
import { test } from "../node-test-compat";

function kill(t: number, time: number | null = null): ScannerMatchKill {
	return { t, time, name: null };
}

const kills = (...ts: number[]) => ({ kills: ts.map((t) => kill(t)) });

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
	assert.deepEqual(scoreWindows(kills(100, 105, 110), []), []);
	assert.deepEqual(
		stripped(scoreWindows(kills(100, 105, 110), [], { minKills: 3 })),
		[windowOf(95, 113, 3, 110)],
	);
});

test("a run of close kills is one window with lead and tail", () => {
	assert.deepEqual(stripped(scoreWindows(kills(100, 110, 125, 130), [])), [
		windowOf(95, 133, 4, 130),
	]);
});

test("the clip start clamps to the stream start", () => {
	assert.deepEqual(stripped(scoreWindows(kills(2, 4, 6, 8), [])), [
		windowOf(0, 11, 4, 8),
	]);
});

test("a long pause splits the streak", () => {
	assert.deepEqual(
		stripped(scoreWindows(kills(100, 105, 110, 115, 140, 145, 150, 155), [])),
		[windowOf(95, 118, 4, 115), windowOf(135, 158, 4, 155)],
	);
});

test("a death between two kills ends the streak", () => {
	assert.deepEqual(scoreWindows(kills(100, 105, 110, 115), [107.5]), []);
	assert.deepEqual(
		stripped(scoreWindows(kills(100, 105, 110, 115, 120), [116])),
		[windowOf(95, 118, 4, 115)],
	);
});

test("a death on a kill's second (a trade) counts after that kill", () => {
	assert.deepEqual(stripped(scoreWindows(kills(100, 105, 110, 115), [115])), [
		windowOf(95, 118, 4, 115),
	]);
});

test("a streak is cut where its clip would outgrow the cap", () => {
	assert.deepEqual(
		stripped(
			scoreWindows(kills(100, 115, 130, 145, 160, 175, 190, 205, 220), [], {
				maxSeconds: 60,
			}),
		),
		[windowOf(95, 148, 4, 145), windowOf(155, 208, 4, 205)],
	);
});

test("the score ranks the longer streak first, the tighter one second", () => {
	const [loose] = scoreWindows(kills(100, 110, 120, 130), []);
	const [tight] = scoreWindows(kills(100, 102, 104, 106), []);
	const [longer] = scoreWindows(kills(100, 110, 120, 130, 140), []);
	assert.ok(tight!.score > loose!.score);
	assert.ok(longer!.score > tight!.score);
});

test("the window carries its last kill's timer reading", () => {
	const [window] = scoreWindows(
		{ kills: [kill(100, 200), kill(103, 197), kill(106, 194), kill(109, 191)] },
		[],
	);
	assert.equal(window!.time, 191);
});

test("a window closes once the streak gap has passed its last kill", () => {
	const [window] = scoreWindows(kills(100, 105, 110, 115), []);
	assert.equal(windowClosed(window!, 129), false);
	assert.equal(windowClosed(window!, 130), true);
});

test("clipCovers is inclusive of both ends", () => {
	assert.equal(clipCovers({ start: 95, end: 119 }, 95), true);
	assert.equal(clipCovers({ start: 95, end: 119 }, 119), true);
	assert.equal(clipCovers({ start: 95, end: 119 }, 120), false);
});

function minimapRead(t: number, cards: { self: boolean; dead: boolean }[]) {
	return {
		type: MINIMAP_EVENT_TYPE,
		t,
		confidence: 1,
		data: {
			teammates: cards.map((card) => ({ ...card, specialReady: false })),
		},
	};
}

test("a minimap read striking out the POV card is a POV death", () => {
	const events = [
		{ type: DEATH_EVENT_TYPE, t: 50, confidence: 1, data: {} },
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
		scoreWindows(kills(100, 105, 110, 115), povDeathTimes(events)),
		[],
	);
});
