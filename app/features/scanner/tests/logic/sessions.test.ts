/**
 * Tests for the client-side sessions: the 2 h gap split, the header numbers
 * and which sessions retention evicts.
 */

import assert from "node:assert/strict";
import type { ScannerMatch } from "../../core/scanner-match";
import {
	compactSources,
	expiredCompactedSessionKeys,
	expiredSessionEventIds,
	kdRatio,
	MAX_SESSIONS,
	MAX_STORED_EVENTS,
	SESSION_GAP_MS,
	SESSION_MAX_AGE_MS,
	sessionKey,
	sessionSummary,
	splitSessions,
} from "../../core/sessions";
import { test } from "../node-test-compat";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** `count` events a second apart from `start`, ids continuing from `firstId` */
function eventRun(start: number, count: number, firstId: number) {
	return Array.from({ length: count }, (_, i) => ({
		id: firstId + i,
		detectedAt: start + i * 1000,
	}));
}

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

test("retention drops the oldest whole sessions past the event budget", () => {
	const now = 100 * DAY;
	const half = MAX_STORED_EVENTS / 2;
	const oldest = eventRun(now - 3 * DAY, half, 0);
	const middle = eventRun(now - 2 * DAY, half, half);
	const newest = eventRun(now - DAY, half, 2 * half);
	const ids = expiredSessionEventIds([...oldest, ...middle, ...newest], now);
	assert.deepEqual(
		ids,
		oldest.map((e) => e.id),
	);
});

test("retention keeps the newest session whole even past the event budget", () => {
	const now = 100 * DAY;
	const older = eventRun(now - 2 * DAY, 10, 0);
	const newest = eventRun(now - DAY, MAX_STORED_EVENTS + 1, 10);
	const ids = expiredSessionEventIds([...older, ...newest], now);
	assert.deepEqual(
		ids,
		older.map((e) => e.id),
	);
});

test("compaction keeps every source but the per-second reads", () => {
	const sources = [
		{ type: "Objective" },
		{ type: "MapStart" },
		{ type: "PlayerStatus" },
		{ type: "StripWeapons" },
		{ type: "Death" },
		{ type: "Scoreboard" },
	];
	assert.deepEqual(
		compactSources(sources).map((event) => event.type),
		["MapStart", "Death", "Scoreboard"],
	);
});

test("a match read only off per-second reads keeps its first source", () => {
	const sources = [{ type: "Objective" }, { type: "PlayerStatus" }];
	assert.deepEqual(compactSources(sources), [sources[0]]);
});

test("compacted retention counts the raw sessions against the session cap", () => {
	const now = 100 * DAY;
	const compacted = Array.from({ length: MAX_SESSIONS }, (_, i) => ({
		key: now - (MAX_SESSIONS - i) * DAY,
		endedAt: now - (MAX_SESSIONS - i) * DAY + HOUR,
	}));
	assert.deepEqual(expiredCompactedSessionKeys(compacted, 2, now), [
		compacted[1]!.key,
		compacted[0]!.key,
	]);
});

test("compacted retention drops sessions older than 30 days", () => {
	const now = 100 * DAY;
	const old = { key: now - 40 * DAY, endedAt: now - 40 * DAY + HOUR };
	const recent = { key: now - 5 * DAY, endedAt: now - 5 * DAY + HOUR };
	assert.deepEqual(expiredCompactedSessionKeys([old, recent], 0, now), [
		old.key,
	]);
});
