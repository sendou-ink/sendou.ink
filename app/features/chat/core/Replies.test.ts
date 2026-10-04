import { describe, expect, test } from "vitest";
import * as Replies from "./Replies";

describe("Replies.split", () => {
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
		expect(Replies.split(contents)).toEqual(expected);
	});
});

describe("Replies.hasValid", () => {
	test.each([
		{ why: "no reply", contents: "hi", expected: true },
		{ why: "one reply", contents: "<reply-1> hi", expected: true },
		{ why: "two replies", contents: "<reply-1><reply-2> hi", expected: false },
	])("$why", ({ contents, expected }) => {
		expect(Replies.hasValid(contents)).toBe(expected);
	});
});
