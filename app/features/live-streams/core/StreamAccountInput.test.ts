import { describe, expect, test } from "bun:test";
import * as StreamAccountInput from "./StreamAccountInput";

const CHANNEL_ID = "UCabcdefghijklmnopqrstuv";

describe("StreamAccountInput.parse", () => {
	test.each([
		{
			why: "twitch login lowercased",
			input: "DappleProductions",
			expected: { platform: "TWITCH", account: "dappleproductions" },
		},
		{
			why: "twitch login surrounding whitespace",
			input: "  sendou_ink ",
			expected: { platform: "TWITCH", account: "sendou_ink" },
		},
		{
			why: "twitch url",
			input: "https://www.twitch.tv/Sendou",
			expected: { platform: "TWITCH", account: "sendou" },
		},
		{
			why: "twitch url without protocol",
			input: "twitch.tv/sendou/videos",
			expected: { platform: "TWITCH", account: "sendou" },
		},
		{
			why: "youtube handle",
			input: "@SendouInk",
			expected: { platform: "YOUTUBE", handle: "SendouInk" },
		},
		{
			why: "youtube handle url",
			input: "https://www.youtube.com/@sendou.ink/streams",
			expected: { platform: "YOUTUBE", handle: "sendou.ink" },
		},
		{
			why: "youtube handle url with encoded non-latin characters",
			input: "https://youtube.com/@%E3%81%99%E3%81%B7%E3%82%89",
			expected: { platform: "YOUTUBE", handle: "すぷら" },
		},
		{
			why: "youtube mobile handle url without protocol",
			input: "m.youtube.com/@sendou?si=abc",
			expected: { platform: "YOUTUBE", handle: "sendou" },
		},
		{
			why: "youtube channel url",
			input: `https://www.youtube.com/channel/${CHANNEL_ID}/live`,
			expected: { platform: "YOUTUBE", channelId: CHANNEL_ID },
		},
	] as const)("$why", ({ input, expected }) => {
		expect(StreamAccountInput.parse(input)).toEqual(expected);
	});

	test.each([
		{ why: "empty", input: "" },
		{ why: "twitch login with space", input: "sendou ink" },
		{ why: "twitch login too long", input: "a".repeat(26) },
		{ why: "twitch url without login", input: "https://twitch.tv" },
		{ why: "too short handle", input: "@ab" },
		{ why: "handle with space", input: "@sendou ink" },
		{ why: "malformed channel id", input: "youtube.com/channel/UCshort" },
		{ why: "legacy custom url", input: "https://youtube.com/c/sendou" },
		{ why: "video url", input: "https://www.youtube.com/watch?v=abc" },
		{ why: "other site", input: "https://kick.com/sendou" },
		{ why: "non-http protocol", input: "javascript://twitch.tv/sendou" },
	])("$why is invalid", ({ input }) => {
		expect(StreamAccountInput.parse(input)).toBeNull();
	});
});
