import { describe, expect, test } from "vitest";
import * as FeedRanking from "./FeedRanking";

const NOW = 1_800_000_000;
const HOUR = 3600;

describe("FeedRanking.isStale", () => {
	test.each([
		{ why: "fresh", type: "SQ_SET", ageHours: 1, expected: false },
		{
			why: "just within the max age",
			type: "SQ_SET",
			ageHours: 90,
			expected: false,
		},
		{ why: "past the max age", type: "SQ_SET", ageHours: 91, expected: true },
		{ why: "live", type: "VOICE_ROOM", ageHours: 1000, expected: false },
		{ why: "pinned", type: "ANNOUNCEMENT", ageHours: 10_000, expected: false },
	] as const)("$why", ({ type, ageHours, expected }) => {
		expect(FeedRanking.isStale({ type, at: NOW - ageHours * HOUR }, NOW)).toBe(
			expected,
		);
	});
});

describe("FeedRanking.score", () => {
	test("halves the score after one half-life", () => {
		const fresh = FeedRanking.score({ type: "SQ_SET", at: NOW }, NOW);
		const old = FeedRanking.score({ type: "SQ_SET", at: NOW - 18 * HOUR }, NOW);

		expect(old.total).toBeCloseTo(fresh.total / 2);
	});

	test("doesn't decay live items", () => {
		const result = FeedRanking.score(
			{ type: "VOICE_ROOM", at: NOW - 10 * HOUR },
			NOW,
		);

		expect(result.recency).toBe(1);
	});

	test("uses the closest audience as the affinity", () => {
		const result = FeedRanking.score({ type: "VOD_NEW", at: NOW }, NOW);

		expect(result.affinity).toBe(0.75);
	});
});

describe("FeedRanking.rank", () => {
	test("orders by score", () => {
		const ranked = FeedRanking.rank(
			[
				{ type: "FRIEND_NEW", at: NOW, actorKey: "a" },
				{ type: "TO_WIN", at: NOW, actorKey: "b" },
			],
			NOW,
		);

		expect(ranked.map((item) => item.type)).toEqual(["TO_WIN", "FRIEND_NEW"]);
	});

	test("pushes back an item whose actor just appeared", () => {
		const ranked = FeedRanking.rank(
			[
				{ type: "TO_WIN", at: NOW, actorKey: "a" },
				{ type: "SQ_SET", at: NOW, actorKey: "a" },
				{ type: "ART_NEW", at: NOW, actorKey: "b" },
			],
			NOW,
		);

		expect(ranked.map((item) => item.type)).toEqual([
			"TO_WIN",
			"ART_NEW",
			"SQ_SET",
		]);
	});
});
