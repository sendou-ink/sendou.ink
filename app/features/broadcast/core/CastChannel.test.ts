import { describe, expect, test } from "vitest";
import type { CastAccount } from "~/db/tables-json";
import * as CastChannel from "./CastChannel";

const twitch: CastAccount = {
	platform: "TWITCH",
	account: "SendouInk",
	name: "SendouInk",
};
const youtube: CastAccount = {
	platform: "YOUTUBE",
	account: "UC1234567890",
	name: "Splat Cast!",
};
const youtubeWithoutLatinName: CastAccount = {
	platform: "YOUTUBE",
	account: "UCabcdef",
	name: "スプラ",
};

describe("CastChannel.findBySlug", () => {
	test.each([
		{ why: "twitch login lowercased", slug: "sendouink", expected: twitch },
		{ why: "youtube name slugified", slug: "splat-cast", expected: youtube },
		{
			why: "youtube channel id when the name has no slug",
			slug: "ucabcdef",
			expected: youtubeWithoutLatinName,
		},
		{ why: "unknown", slug: "nope", expected: undefined },
	])("$why", ({ slug, expected }) => {
		const channel = CastChannel.findBySlug(
			[twitch, youtube, youtubeWithoutLatinName],
			slug,
		);

		expect(channel?.account).toBe(expected?.account);
	});
});

describe("CastChannel.featuredMatchId", () => {
	const channel = { platform: "TWITCH" as const, account: "sendouink" };
	const otherChannel = { platform: "TWITCH" as const, account: "other" };

	test.each([
		{
			why: "the match cast on the channel over a locked one",
			castedMatches: [
				{ ...otherChannel, matchId: 1 },
				{ ...channel, matchId: 2 },
			],
			lockedMatches: [{ ...channel, matchId: 3 }],
			expected: 2,
		},
		{
			why: "the first locked match when nothing is cast",
			castedMatches: [{ ...otherChannel, matchId: 1 }],
			lockedMatches: [
				{ ...channel, matchId: 3 },
				{ ...channel, matchId: 4 },
			],
			expected: 3,
		},
		{
			why: "none for the channel",
			castedMatches: [{ ...otherChannel, matchId: 1 }],
			lockedMatches: [],
			expected: null,
		},
	])("$why", ({ castedMatches, lockedMatches, expected }) => {
		expect(
			CastChannel.featuredMatchId({
				castedMatchesInfo: { castedMatches, lockedMatches },
				channel,
			}),
		).toBe(expected);
	});
});
