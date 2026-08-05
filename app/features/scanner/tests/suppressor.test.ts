/**
 * Unit tests for ParseSuppressor: a static screen (gate keeps passing,
 * confidence stops improving) gets its parse() suppressed after the
 * stagnation budget, and any gate drop resets the streak.
 */

import assert from "node:assert/strict";
import { ParseSuppressor } from "../core/detectors/suppressor";
import test from "./node-test-compat";

const OPTS = { maxStagnantParses: 3, minImprovement: 0.001 };

function feed(
	s: ParseSuppressor,
	id: string,
	confidence: number | null,
): boolean {
	const allowed = s.shouldParse(id, true);
	if (allowed) s.recordParse(id, confidence === null ? [] : [{ confidence }]);
	return allowed;
}

test("suppresses after stagnant parses on a static screen", () => {
	const s = new ParseSuppressor(OPTS);
	assert.equal(feed(s, "scoreboard", 0.9), true); // sets the baseline
	assert.equal(feed(s, "scoreboard", 0.9), true); // stagnant 1
	assert.equal(feed(s, "scoreboard", 0.9), true); // stagnant 2
	assert.equal(feed(s, "scoreboard", 0.9), true); // stagnant 3 -> suppressed
	assert.equal(s.shouldParse("scoreboard", true), false);
	assert.equal(s.shouldParse("scoreboard", true), false);
});

test("an improving read resets the stagnation counter", () => {
	const s = new ParseSuppressor(OPTS);
	feed(s, "scoreboard", 0.7);
	feed(s, "scoreboard", 0.7);
	feed(s, "scoreboard", 0.7);
	assert.equal(feed(s, "scoreboard", 0.85), true); // improvement, counter resets
	assert.equal(feed(s, "scoreboard", 0.85), true);
	assert.equal(feed(s, "scoreboard", 0.85), true);
	assert.equal(feed(s, "scoreboard", 0.85), true); // stagnant 3 -> suppressed
	assert.equal(s.shouldParse("scoreboard", true), false);
});

test("a gate drop ends the streak and re-enables parsing", () => {
	const s = new ParseSuppressor(OPTS);
	for (let i = 0; i < 5; i++) feed(s, "scoreboard", 0.9);
	assert.equal(s.shouldParse("scoreboard", true), false);
	assert.equal(s.shouldParse("scoreboard", false), false); // screen changed
	assert.equal(feed(s, "scoreboard", 0.9), true); // fresh streak parses again
});

test("gate firing without events stagnates too", () => {
	const s = new ParseSuppressor(OPTS);
	for (let i = 0; i < 4; i++) assert.equal(feed(s, "death", null), true);
	assert.equal(s.shouldParse("death", true), false);
});

test("detectors are tracked independently", () => {
	const s = new ParseSuppressor(OPTS);
	for (let i = 0; i < 5; i++) feed(s, "scoreboard", 0.9);
	assert.equal(s.shouldParse("scoreboard", true), false);
	assert.equal(s.shouldParse("death", true), true);
});
