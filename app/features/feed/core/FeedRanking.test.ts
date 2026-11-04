import { describe, expect, test } from "vitest";
import {
	FEED_AUDIENCE_AFFINITY,
	FEED_WEAPON_AFFINITY,
} from "../feed-constants";
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

	test("scales the score by the item's weight", () => {
		const full = FeedRanking.score(
			{ type: "SQ_SET", at: NOW, relation: null },
			NOW,
		);
		const weighted = FeedRanking.score(
			{ type: "SQ_SET", at: NOW, relation: null, weight: 0.25 },
			NOW,
		);

		expect(weighted.total).toBeCloseTo(full.total / 4);
	});

	test.each([
		{
			why: "no relation: the widest audience of the type",
			relation: null,
			expected: FEED_AUDIENCE_AFFINITY.EVERYONE,
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

describe("FeedRanking.score", () => {
	const SPLATTERSHOT = 40;
	const TENTATEK_SPLATTERSHOT = 41;
	const HERO_SHOT_REPLICA = 45;
	const SPLASH_O_MATIC = 20;
	const SPLAT_CHARGER = 2010;

	test.each([
		{
			why: "same weapon",
			weaponSplIds: [SPLATTERSHOT],
			expected: FEED_WEAPON_AFFINITY.SAME_WEAPON,
		},
		{
			why: "kit of the same base weapon",
			weaponSplIds: [TENTATEK_SPLATTERSHOT],
			expected: FEED_WEAPON_AFFINITY.SAME_WEAPON,
		},
		{
			why: "skin of the same base weapon",
			weaponSplIds: [HERO_SHOT_REPLICA],
			expected: FEED_WEAPON_AFFINITY.SAME_WEAPON,
		},
		{
			why: "same weapon among others",
			weaponSplIds: [SPLASH_O_MATIC, SPLAT_CHARGER, SPLATTERSHOT],
			expected: FEED_WEAPON_AFFINITY.SAME_WEAPON,
		},
		{
			why: "same category",
			weaponSplIds: [SPLASH_O_MATIC],
			expected: FEED_WEAPON_AFFINITY.SAME_CATEGORY,
		},
		{
			why: "other category",
			weaponSplIds: [SPLAT_CHARGER],
			expected: FEED_WEAPON_AFFINITY.NONE,
		},
		{
			why: "no weapons",
			weaponSplIds: [],
			expected: FEED_WEAPON_AFFINITY.NONE,
		},
	] as const)("$why", ({ weaponSplIds, expected }) => {
		const result = FeedRanking.score(
			{
				type: "VOD_NEW",
				at: NOW,
				relation: null,
				weaponSplIds: [...weaponSplIds],
			},
			NOW,
			[TENTATEK_SPLATTERSHOT],
		);

		expect(result.weaponAffinity).toBe(expected);
	});

	test("is none without a weapon pool", () => {
		const result = FeedRanking.score(
			{
				type: "VOD_NEW",
				at: NOW,
				relation: null,
				weaponSplIds: [SPLATTERSHOT],
			},
			NOW,
		);

		expect(result.weaponAffinity).toBe(FEED_WEAPON_AFFINITY.NONE);
	});

	test("scales the score by the weapon affinity", () => {
		const plain = FeedRanking.score(
			{ type: "BUILD_NEW", at: NOW, relation: null },
			NOW,
			[SPLATTERSHOT],
		);
		const matching = FeedRanking.score(
			{
				type: "BUILD_NEW",
				at: NOW,
				relation: null,
				weaponSplIds: [SPLATTERSHOT],
			},
			NOW,
			[SPLATTERSHOT],
		);

		expect(matching.total).toBeCloseTo(
			plain.total * FEED_WEAPON_AFFINITY.SAME_WEAPON,
		);
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
