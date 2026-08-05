/**
 * resolveMatchScores is pure — the parse side of banner.ts is covered by
 * the scoreboard fixture suite, this pins the winner/loser resolution.
 */

import assert from "node:assert/strict";
import {
	type BannerScoreRead,
	resolveMatchScores,
} from "../core/detectors/scoreboard/banner";
import test from "./node-test-compat";

function read(value: number | null, confidence = 0.9): BannerScoreRead {
	return {
		value,
		confidence,
		digits: value === null ? 0 : String(value).length,
		reading: value === null ? "" : String(value),
	};
}

test("both sides read: higher value is the winner's, either way around", () => {
	assert.deepEqual(
		resolveMatchScores({ left: read(71), right: read(88), knockout: false }),
		[88, 71],
	);
	assert.deepEqual(
		resolveMatchScores({ left: read(88), right: read(71), knockout: false }),
		[88, 71],
	);
});

test("a knockout reports the full count over anything read off the burst", () => {
	// burst letters surviving the floor read as a junk low-confidence value
	assert.deepEqual(
		resolveMatchScores({
			left: read(0, 0.88),
			right: read(7, 0.62),
			knockout: true,
		}),
		[100, 0],
	);
});

test("a knockout's loser is the side that read", () => {
	assert.deepEqual(
		resolveMatchScores({ left: read(null), right: read(0), knockout: true }),
		[100, 0],
	);
	assert.deepEqual(
		resolveMatchScores({ left: read(0), right: read(null), knockout: true }),
		[100, 0],
	);
	assert.deepEqual(
		resolveMatchScores({ left: read(null), right: read(null), knockout: true }),
		[100, null],
	);
});

test("one unreadable side without a knockout reports nothing", () => {
	assert.deepEqual(
		resolveMatchScores({ left: read(71), right: read(null), knockout: false }),
		[null, null],
	);
	assert.deepEqual(
		resolveMatchScores({
			left: read(null),
			right: read(null),
			knockout: false,
		}),
		[null, null],
	);
});
