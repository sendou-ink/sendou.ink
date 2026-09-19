/**
 * Tests for the client-side sessions: the 2 h gap split, the header numbers
 * and which sessions retention evicts.
 */

import assert from "node:assert/strict";
import type { ScannerMatch } from "../../core/scanner-match";
import {
	expiredSessionEventIds,
	kdRatio,
	MAX_SESSIONS,
	SESSION_GAP_MS,
	SESSION_MAX_AGE_MS,
	sessionKey,
	sessionSummary,
	splitSessions,
} from "../../core/sessions";
import { test } from "../node-test-compat";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function stamped(...detectedAts: number[]) {
	return detectedAts.map((detectedAt, id) => ({ id, detectedAt }));
}

function match(
	overrides: Partial<ScannerMatch> & {
		result?: "win" | "loss";
		ka?: number;
		d?: number;
	} = {},
): ScannerMatch {
	const { result, ka = 5, d = 3, ...rest } = overrides;
	const pov = { team: 0 as const, index: 0 };
	return {
		startsAt: 0,
		endsAt: 300,
		playedAt: null,
		lobby: "PRIVATE",
		mode: "SZ",
		stage: 0,
		matchScores: null,
		replayCode: null,
		cast: false,
		objective: null,
		playerStatus: null,
		kills: null,
		teams: [
			{ players: [{ name: "me", weaponId: 40, paint: 900, ka, d, s: 2 }] },
			{ players: [] },
		],
		winner: result === undefined ? null : result === "win" ? 0 : 1,
		pov,
		...rest,
	};
}

test("events less than two hours apart share a session", () => {
	const sessions = splitSessions(stamped(0, HOUR, 2 * HOUR - 1));
	assert.equal(sessions.length, 1);
	assert.equal(sessions[0]!.length, 3);
});

test("a gap of two hours starts a new session", () => {
	const sessions = splitSessions(stamped(0, 10, 10 + SESSION_GAP_MS));
	assert.deepEqual(
		sessions.map((session) => session.map((e) => e.id)),
		[[0, 1], [2]],
	);
});

test("the split follows detection time, not input order", () => {
	const events = stamped(5 * HOUR, 0, 10);
	const sessions = splitSessions(events);
	assert.deepEqual(
		sessions.map((session) => session.map((e) => e.id)),
		[[1, 2], [0]],
	);
});

test("a session is keyed by its first detection", () => {
	assert.equal(sessionKey(stamped(1_000, 2_000)), 1_000);
});

test("the summary counts decided games, the record and the POV K/D", () => {
	const summary = sessionSummary([
		match({ result: "win", ka: 8, d: 2 }),
		match({ result: "loss", ka: 4, d: 6 }),
		match(),
	]);
	assert.deepEqual(summary, { games: 2, wins: 1, losses: 1, ka: 17, d: 11 });
	assert.equal(kdRatio(summary)!.toFixed(2), "1.55");
});

test("a match without a POV seat counts as a game but not a result", () => {
	const summary = sessionSummary([match({ result: "win", pov: null })]);
	assert.equal(summary.games, 1);
	assert.equal(summary.wins, 0);
	assert.equal(summary.losses, 0);
	assert.equal(kdRatio(summary), null);
});

test("K/D never divides by zero deaths", () => {
	assert.equal(kdRatio({ games: 1, wins: 1, losses: 0, ka: 7, d: 0 }), 7);
});

test("retention drops sessions older than 30 days", () => {
	const now = 100 * DAY;
	const ids = expiredSessionEventIds(
		[
			{ id: 1, detectedAt: now - SESSION_MAX_AGE_MS - HOUR },
			{ id: 2, detectedAt: now - SESSION_MAX_AGE_MS - HOUR + 1000 },
			{ id: 3, detectedAt: now - DAY },
		],
		now,
	);
	assert.deepEqual(ids, [1, 2]);
});

test("retention keeps the newest sessions only", () => {
	const now = 100 * DAY;
	const events = Array.from({ length: MAX_SESSIONS + 2 }, (_, i) => ({
		id: i,
		detectedAt: now - (MAX_SESSIONS + 2 - i) * 3 * HOUR,
	}));
	assert.deepEqual(expiredSessionEventIds(events, now), [0, 1]);
});
