import { describe, expect, test } from "vitest";
import { hasValidReplies, messageReply } from "./chat-replies";

describe("messageReply", () => {
	test.each([
		{
			why: "a reply with text",
			contents: "<reply-12> agreed",
			expected: { rest: "agreed", replyToMessageId: 12 },
		},
		{
			why: "a reply with a sticker",
			contents: "<reply-12> <sticker-booyah>",
			expected: { rest: "<sticker-booyah>", replyToMessageId: 12 },
		},
		{
			why: "no reply",
			contents: "hello",
			expected: { rest: "hello", replyToMessageId: null },
		},
	])("$why", ({ contents, expected }) => {
		expect(messageReply(contents)).toEqual(expected);
	});
});

describe("hasValidReplies", () => {
	test.each([
		{ why: "no reply", contents: "hi", expected: true },
		{ why: "one reply", contents: "<reply-1> hi", expected: true },
		{ why: "two replies", contents: "<reply-1><reply-2> hi", expected: false },
	])("$why", ({ contents, expected }) => {
		expect(hasValidReplies(contents)).toBe(expected);
	});
});
