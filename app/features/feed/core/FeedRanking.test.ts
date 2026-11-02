import { describe, expect, test } from "vitest";
import { FEED_AUDIENCE_AFFINITY } from "../feed-constants";
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
		const fresh = FeedRanking.score(
			{ type: "SQ_SET", at: NOW, relation: null },
			NOW,
		);
		const old = FeedRanking.score(
			{ type: "SQ_SET", at: NOW - 18 * HOUR, relation: null },
			NOW,
		);

		expect(old.total).toBeCloseTo(fresh.total / 2);
	});

	test("doesn't decay live items", () => {
		const result = FeedRanking.score(
			{ type: "VOICE_ROOM", at: NOW - 10 * HOUR, relation: null },
			NOW,
		);

		expect(result.recency).toBe(1);
	});

	test.each([
		{
			why: "no relation: the closest audience of the type",
			relation: null,
			expected: FEED_AUDIENCE_AFFINITY.FOLLOWING,
		},
		{ why: "self", relation: "SELF", expected: FEED_AUDIENCE_AFFINITY.SELF },
		{
			why: "friend",
			relation: "FRIEND",
			expected: FEED_AUDIENCE_AFFINITY.FRIENDS,
		},
		{
			why: "teammate",
			relation: "TEAMMATE",
			expected: FEED_AUDIENCE_AFFINITY.TEAM,
		},
	] as const)("affinity of $why", ({ relation, expected }) => {
		const result = FeedRanking.score(
			{ type: "VOD_NEW", at: NOW, relation },
			NOW,
		);

		expect(result.affinity).toBe(expected);
	});
});

describe("FeedRanking.rank", () => {
	test("orders by score", () => {
		const ranked = FeedRanking.rank(
			[
				{ type: "FRIEND_NEW", at: NOW, actorKey: "a", relation: null },
				{ type: "TO_WIN", at: NOW, actorKey: "b", relation: null },
			],
			NOW,
		);

		expect(ranked.map((item) => item.type)).toEqual(["TO_WIN", "FRIEND_NEW"]);
	});

	test("pushes back an item whose actor just appeared", () => {
		const ranked = FeedRanking.rank(
			[
				{ type: "TO_WIN", at: NOW, actorKey: "a", relation: null },
				{ type: "SQ_SET", at: NOW, actorKey: "a", relation: null },
				{ type: "ART_NEW", at: NOW, actorKey: "b", relation: null },
			],
			NOW,
		);

		expect(ranked.map((item) => item.type)).toEqual([
			"TO_WIN",
			"ART_NEW",
			"SQ_SET",
		]);
	});

	test("pushes back repeats of a type", () => {
		const ranked = FeedRanking.rank(
			[
				{ type: "SQ_SET", at: NOW, actorKey: "a", relation: null },
				{ type: "SQ_SET", at: NOW, actorKey: "b", relation: null },
				{ type: "SQ_SET", at: NOW, actorKey: "c", relation: null },
				{ type: "BUILD_NEW", at: NOW, actorKey: "d", relation: null },
			],
			NOW,
		);

		expect(ranked.map((item) => item.type)).toEqual([
			"SQ_SET",
			"SQ_SET",
			"BUILD_NEW",
			"SQ_SET",
		]);
	});
});
