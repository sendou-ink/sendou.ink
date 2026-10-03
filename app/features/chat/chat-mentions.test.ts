import { describe, expect, test } from "vitest";
import {
	activeMentionQuery,
	encodeMentions,
	mentionSuggestions,
	mentionsUser,
	shiftPickedMentions,
	splitByMentions,
	visibleLength,
} from "./chat-mentions";

const USERS = [
	{ id: 1, username: "Bob" },
	{ id: 2, username: "Bobby" },
	{ id: 3, username: "Ana Banana" },
];

describe("encodeMentions", () => {
	test.each([
		{ why: "a typed name", text: "hi @Bob", expected: "hi <mention-1>" },
		{
			why: "names match case-insensitively",
			text: "@bob gg",
			expected: "<mention-1> gg",
		},
		{
			why: "the longest matching name wins",
			text: "@Bobby ready?",
			expected: "<mention-2> ready?",
		},
		{
			why: "names with spaces",
			text: "@Ana Banana pick",
			expected: "<mention-3> pick",
		},
		{
			why: "punctuation right after the name",
			text: "@Bob, @Bobby!",
			expected: "<mention-1>, <mention-2>!",
		},
		{
			why: "a name continuing into more word characters stays text",
			text: "@Bobbert",
			expected: "@Bobbert",
		},
		{
			why: "an @ glued to a word before it stays text",
			text: "mail@Bob",
			expected: "mail@Bob",
		},
		{
			why: "an unknown name stays text",
			text: "@Carol hi",
			expected: "@Carol hi",
		},
		{ why: "a lone @", text: "@ @", expected: "@ @" },
	])("$why", ({ text, expected }) => {
		expect(encodeMentions(text, USERS)).toBe(expected);
	});

	const SAME_NAME_USERS = [
		{ id: 1, username: "Bob" },
		{ id: 4, username: "Bob" },
	];

	test.each([
		{
			why: "picked mentions tell users sharing a name apart",
			text: "@Bob @Bob",
			picked: [
				{ userId: 4, username: "Bob", start: 0 },
				{ userId: 1, username: "Bob", start: 5 },
			],
			expected: "<mention-4> <mention-1>",
		},
		{
			why: "a typed name next to picked ones falls back to the first match",
			text: "@Bob @Bob",
			picked: [{ userId: 4, username: "Bob", start: 5 }],
			expected: "<mention-1> <mention-4>",
		},
		{
			why: "a picked mention whose name was edited is not a mention",
			text: "@Bobx",
			picked: [{ userId: 4, username: "Bob", start: 0 }],
			expected: "@Bobx",
		},
	])("$why", ({ text, picked, expected }) => {
		expect(encodeMentions(text, SAME_NAME_USERS, picked)).toBe(expected);
	});
});

describe("shiftPickedMentions", () => {
	const bobAt = (start: number) => ({ userId: 1, username: "Bob", start });

	test.each([
		{
			why: "typing after a mention keeps it",
			previous: "@Bob ",
			next: "@Bob hi",
			expected: [bobAt(0)],
		},
		{
			why: "typing before a mention moves it",
			previous: "@Bob ",
			next: "hi @Bob ",
			expected: [bobAt(3)],
		},
		{
			why: "deleting before a mention moves it back",
			previous: "hi @Bob ",
			next: "@Bob ",
			expected: [bobAt(0)],
		},
		{
			why: "editing inside a mention drops it",
			previous: "@Bob ",
			next: "@Bb ",
			expected: [],
		},
		{
			why: "replacing a selection over a mention drops it",
			previous: "a @Bob b",
			next: "a x b",
			expected: [],
		},
	])("$why", ({ previous, next, expected }) => {
		const start = previous.indexOf("@");

		expect(shiftPickedMentions([bobAt(start)], previous, next)).toEqual(
			expected,
		);
	});
});

describe("splitByMentions", () => {
	test("splits text and mention tokens in order", () => {
		expect(splitByMentions("hi <mention-1> and <mention-22>!")).toEqual([
			{ type: "text", text: "hi " },
			{ type: "mention", userId: 1 },
			{ type: "text", text: " and " },
			{ type: "mention", userId: 22 },
			{ type: "text", text: "!" },
		]);
	});

	test.each([
		["plain text", "no mentions here"],
		["a malformed token", "<mention-abc>"],
	])("keeps %s as one text part", (_why, contents) => {
		expect(splitByMentions(contents)).toEqual([
			{ type: "text", text: contents },
		]);
	});
});

describe("mentionsUser", () => {
	test.each([
		{ why: "mentioned", contents: "hi <mention-1>", userId: 1, expected: true },
		{
			why: "another id sharing a prefix",
			contents: "hi <mention-12>",
			userId: 1,
			expected: false,
		},
	])("$why", ({ contents, userId, expected }) => {
		expect(mentionsUser(contents, userId)).toBe(expected);
	});
});

describe("visibleLength", () => {
	test.each([
		{ why: "plain text", contents: "hello", expected: 5 },
		{ why: "a token counts as one", contents: "hi <mention-123>", expected: 4 },
	])("$why", ({ contents, expected }) => {
		expect(visibleLength(contents)).toBe(expected);
	});
});

describe("mentionSuggestions", () => {
	const users = [
		{ username: "Mobob" },
		{ username: "Bobby" },
		{ username: "Ana" },
		{ username: "bob" },
	];

	test.each([
		{
			why: "names starting with the query come first",
			query: "bob",
			expected: ["Bobby", "bob", "Mobob"],
		},
		{
			why: "an empty query lists everyone",
			query: "",
			expected: ["Mobob", "Bobby", "Ana", "bob"],
		},
		{ why: "no match", query: "zzz", expected: [] },
	])("$why", ({ query, expected }) => {
		expect(
			mentionSuggestions(users, query).map((user) => user.username),
		).toEqual(expected);
	});

	test("lists at most six", () => {
		const many = Array.from({ length: 10 }, (_, i) => ({
			username: `User${i}`,
		}));

		expect(mentionSuggestions(many, "user")).toHaveLength(6);
	});
});

describe("activeMentionQuery", () => {
	test.each([
		{
			why: "just the @",
			text: "@",
			caret: 1,
			expected: { query: "", start: 0 },
		},
		{
			why: "a partial name after a space",
			text: "gg @Bo",
			caret: 6,
			expected: { query: "Bo", start: 3 },
		},
		{
			why: "the caret in the middle of the text",
			text: "@Bo there",
			caret: 3,
			expected: { query: "Bo", start: 0 },
		},
		{ why: "a space after the name", text: "@Bob ", caret: 5, expected: null },
		{ why: "an email address", text: "mail@Bo", caret: 7, expected: null },
		{ why: "no @", text: "hello", caret: 5, expected: null },
	])("$why", ({ text, caret, expected }) => {
		expect(activeMentionQuery(text, caret)).toEqual(expected);
	});
});
