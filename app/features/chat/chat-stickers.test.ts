import { describe, expect, test } from "vitest";
import {
	activeStickerQuery,
	hasValidStickers,
	messageSticker,
	stickerSuggestions,
} from "./chat-stickers";

describe("messageSticker", () => {
	test.each([
		{
			why: "text with a sticker",
			contents: "good game <sticker-booyah>",
			expected: { text: "good game", stickerId: "booyah" },
		},
		{
			why: "a sticker alone",
			contents: "<sticker-booyah>",
			expected: { text: "", stickerId: "booyah" },
		},
		{
			why: "text alone",
			contents: "hello",
			expected: { text: "hello", stickerId: undefined },
		},
		{
			why: "an unknown sticker shows nothing",
			contents: "hi <sticker-gone>",
			expected: { text: "hi", stickerId: undefined },
		},
	])("$why", ({ contents, expected }) => {
		const { text, sticker } = messageSticker(contents);

		expect({ text, stickerId: sticker?.id }).toEqual(expected);
	});
});

describe("hasValidStickers", () => {
	test.each([
		{ why: "no sticker", contents: "hi", expected: true },
		{
			why: "one known sticker",
			contents: "hi <sticker-booyah>",
			expected: true,
		},
		{
			why: "two stickers",
			contents: "<sticker-booyah><sticker-sorry>",
			expected: false,
		},
		{ why: "an unknown sticker", contents: "<sticker-gone>", expected: false },
	])("$why", ({ contents, expected }) => {
		expect(hasValidStickers(contents)).toBe(expected);
	});
});

describe("activeStickerQuery", () => {
	test.each([
		{
			why: "just the +",
			text: "+",
			caret: 1,
			expected: { query: "", start: 0 },
		},
		{
			why: "a partial name after a space",
			text: "nice +bo",
			caret: 8,
			expected: { query: "bo", start: 5 },
		},
		{ why: "a sum", text: "1+1", caret: 3, expected: null },
		{ why: "a space after the name", text: "+gg ", caret: 4, expected: null },
	])("$why", ({ text, caret, expected }) => {
		expect(activeStickerQuery(text, caret)).toEqual(expected);
	});
});

describe("stickerSuggestions", () => {
	test("lists the stickers whose name contains the query", () => {
		expect(stickerSuggestions("OO").map((sticker) => sticker.id)).toEqual([
			"booyah",
		]);
	});
});
