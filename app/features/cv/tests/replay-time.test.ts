import assert from "node:assert/strict";
import { parseReplayTimestamp } from "../core/replay-time";
import test from "./node-test-compat";

/** Expected epoch for a local wall time — timezone-independent comparison. */
function local(
	year: number,
	month: number,
	day: number,
	h: number,
	min: number,
): number {
	return new Date(year, month - 1, day, h, min).getTime();
}

test("day-first locale reads D/M/Y", () => {
	assert.equal(
		parseReplayTimestamp("3/7/2026 22:28", {
			locale: "fi-FI",
			now: local(2026, 7, 4, 10, 0),
		}),
		local(2026, 7, 3, 22, 28),
	);
});

test("a 24h hour implies day-first even under a month-first browser locale", () => {
	// the real misread: Finnish console, en-US browser — 21:15 proves a 24h
	// clock (12h consoles render AM/PM), and 24h locales are day-first
	assert.equal(
		parseReplayTimestamp("3.7.2026 21:15", {
			locale: "en-US",
			now: local(2026, 7, 5, 12, 0),
		}),
		local(2026, 7, 3, 21, 15),
	);
	// midnight hours only exist on a 24h clock too
	assert.equal(
		parseReplayTimestamp("3/7/2026 0:45", {
			locale: "en-US",
			now: local(2026, 7, 4, 10, 0),
		}),
		local(2026, 7, 3, 0, 45),
	);
});

test("month-first locale reads M/D/Y when the hour is clock-ambiguous", () => {
	// 9:15 could be either clock, and now is far from both readings — the
	// browser locale is the only remaining signal
	assert.equal(
		parseReplayTimestamp("3/7/2026 9:15", {
			locale: "en-US",
			now: local(2026, 5, 10, 12, 0),
		}),
		local(2026, 3, 7, 9, 15),
	);
});

test("recency flips a locale misread whose swap lands near now", () => {
	// Finnish console with an en-US browser and no 24h evidence: the locale
	// says March 7, but that's months away while July 3 is yesterday
	assert.equal(
		parseReplayTimestamp("3/7/2026 9:15", {
			locale: "en-US",
			now: local(2026, 7, 4, 12, 0),
		}),
		local(2026, 7, 3, 9, 15),
	);
});

test("recency leaves a recent locale reading alone", () => {
	assert.equal(
		parseReplayTimestamp("3/7/2026 9:15", {
			locale: "en-US",
			now: local(2026, 3, 8, 12, 0),
		}),
		local(2026, 3, 7, 9, 15),
	);
});

test("an old replay keeps the locale order when neither reading is recent", () => {
	assert.equal(
		parseReplayTimestamp("5.1.2026 9:15", {
			locale: "fi-FI",
			now: local(2026, 7, 15, 12, 0),
		}),
		local(2026, 1, 5, 9, 15),
	);
});

test("a segment above 12 overrides every order signal", () => {
	assert.equal(
		parseReplayTimestamp("25/7/2026 9:05", { locale: "en-US" }),
		local(2026, 7, 25, 9, 5),
	);
	assert.equal(
		parseReplayTimestamp("7/25/2026 9:05", { locale: "fi-FI" }),
		local(2026, 7, 25, 9, 5),
	);
});

test("dot and dash separators parse", () => {
	const now = local(2026, 3, 8, 12, 0);
	assert.equal(
		parseReplayTimestamp("7.3.2026 22:28", { locale: "de-DE", now }),
		local(2026, 3, 7, 22, 28),
	);
	assert.equal(
		parseReplayTimestamp("7-3-2026 22:28", { locale: "de-DE", now }),
		local(2026, 3, 7, 22, 28),
	);
});

test("year-first format is month-first, regardless of clock or recency", () => {
	assert.equal(
		parseReplayTimestamp("2026/3/7 22:28", {
			locale: "ja-JP",
			now: local(2026, 7, 4, 12, 0),
		}),
		local(2026, 3, 7, 22, 28),
	);
});

test("two-digit year lands in the 2000s", () => {
	assert.equal(
		parseReplayTimestamp("3/7/26 22:28", {
			locale: "fi-FI",
			now: local(2026, 7, 4, 10, 0),
		}),
		local(2026, 7, 3, 22, 28),
	);
});

test("invalid dates and times are rejected", () => {
	assert.equal(
		parseReplayTimestamp("31/2/2026 10:00", { locale: "fi-FI" }),
		null,
	);
	assert.equal(parseReplayTimestamp("13/13/2026 10:00"), null);
	assert.equal(parseReplayTimestamp("3/7/2026 25:00"), null);
	assert.equal(parseReplayTimestamp("3/7/2026 10:60"), null);
	assert.equal(parseReplayTimestamp("not a timestamp"), null);
});
