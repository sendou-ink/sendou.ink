import { type RawBuilder, type SqlBool, sql } from "kysely";
import { describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import { containsIgnoringCase, equalsIgnoringCase } from "./kysely.server";

const matches = async (
	condition: (text: RawBuilder<string>) => RawBuilder<SqlBool>,
	text: string,
) => {
	const row = await db
		.selectNoFrom(condition(sql.val(text)).as("isMatch"))
		.executeTakeFirstOrThrow();

	return Boolean(row.isMatch);
};

describe("containsIgnoringCase", () => {
	test.each([
		{ text: "Low Ink #1", substring: "low ink", expected: true, why: "ASCII" },
		{ text: "Été Cup #1", substring: "été cup", expected: true, why: "É" },
		{ text: "été cup #1", substring: "ÉTÉ CUP", expected: true, why: "é" },
		{ text: "Кубок #1", substring: "кубок", expected: true, why: "Cyrillic" },
		{ text: "ステラ杯", substring: "ステラ", expected: true, why: "uncased" },
		{ text: "Ete Cup", substring: "été", expected: false, why: "accents" },
		{ text: "100 Percent", substring: "100%", expected: false, why: "%" },
		{ text: "a_b", substring: "a_b", expected: true, why: "_ literal" },
		{ text: "axb", substring: "a_b", expected: false, why: "_ not wildcard" },
		{ text: "a\\b", substring: "a\\b", expected: true, why: "backslash" },
	])(
		"$why: '$text' contains '$substring' is $expected",
		async ({ text, substring, expected }) => {
			expect(
				await matches((ref) => containsIgnoringCase(ref, substring), text),
			).toBe(expected);
		},
	);
});

describe("equalsIgnoringCase", () => {
	test.each([
		{ text: "Sendou", value: "sendou", expected: true, why: "ASCII" },
		{
			text: "Братислава",
			value: "братислава",
			expected: true,
			why: "Cyrillic",
		},
		{
			text: "Братислава!",
			value: "братислава",
			expected: false,
			why: "longer",
		},
		{ text: "Sendou", value: "Send%", expected: false, why: "% literal" },
	])(
		"$why: '$text' equals '$value' is $expected",
		async ({ text, value, expected }) => {
			expect(await matches((ref) => equalsIgnoringCase(ref, value), text)).toBe(
				expected,
			);
		},
	);
});
