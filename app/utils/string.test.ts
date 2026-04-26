import { describe, expect, test } from "vitest";
import {
	pathnameFromPotentialURL,
	removeMarkdown,
	truncateBySentence,
} from "./strings";

describe("pathnameFromPotentialURL()", () => {
	test("Resolves path name from valid URL", () => {
		expect(pathnameFromPotentialURL("https://bsky.app/sendouc")).toBe(
			"sendouc",
		);
	});

	test("Returns string as is if not URL", () => {
		expect(pathnameFromPotentialURL("sendouc")).toBe("sendouc");
	});
});

describe("truncateBySentence()", () => {
	test("Truncates text by sentence within max length", () => {
		const text = "This is the first sentence. This is the second sentence.";
		expect(truncateBySentence(text, 30)).toBe("This is the first sentence.");
	});

	test("Returns original text if no sentences fit within max length", () => {
		const text = "This is a very long sentence that exceeds the max length.";
		expect(truncateBySentence(text, 10)).toBe("This is a");
	});

	test("Returns original text if it is shorter than max length", () => {
		const text = "Short text.";
		expect(truncateBySentence(text, 50)).toBe("Short text.");
	});

	test("Handles no senteces", () => {
		const text = "One two three four five six seven eight nine ten";
		expect(truncateBySentence(text, 10)).toBe("One two th");
	});

	test("Truncates text by sentence with newline characters", () => {
		const text = "This is the first sentence\nThis is the second sentence";
		expect(truncateBySentence(text, 30)).toBe("This is the first sentence");
	});

	test("Handles text with multiple newline characters", () => {
		const text = "First line\nSecond line\nThird line";
		expect(truncateBySentence(text, 20)).toBe("First line");
	});
});

describe("removeMarkdown()", () => {
	test("Decodes &nbsp; entities and collapses runs", () => {
		const text = "&nbsp;&nbsp;&nbsp;&nbsp; Global Gauntlet is an event";
		expect(removeMarkdown(text)).toBe("Global Gauntlet is an event");
	});

	test("Decodes common named HTML entities", () => {
		expect(removeMarkdown("Tom &amp; Jerry &lt;3 &quot;hi&quot;")).toBe(
			'Tom & Jerry <3 "hi"',
		);
	});

	test("Decodes numeric HTML entities", () => {
		expect(removeMarkdown("caf&#233; &#x26; tea")).toBe("café & tea");
	});

	test("Leaves unknown named entities untouched", () => {
		expect(removeMarkdown("AT&amp;T &fakeentity; rules")).toBe(
			"AT&T &fakeentity; rules",
		);
	});

	test("Strips HTML tags and markdown emphasis", () => {
		expect(removeMarkdown("<p>Hello **world**!</p>")).toBe("Hello world!");
	});
});
