import { describe, expect, test } from "bun:test";
import * as TranslationSyntax from "./TranslationSyntax";

describe("TranslationSyntax.validate", () => {
	test.each([
		{ why: "plain text", source: "Save", translation: "Speichern" },
		{
			why: "variable kept",
			source: "by {{author}}",
			translation: "von {{author}}",
		},
		{
			why: "variables reordered",
			source: "{{a}} vs {{b}}",
			translation: "{{b}} gegen {{a}}",
		},
		{
			why: "variable with inner whitespace",
			source: "by {{author}}",
			translation: "von {{ author }}",
		},
		{
			why: "tag wrapping different words",
			source: "See <1>FAQ</1> for more",
			translation: "Mehr in den <1>häufigen Fragen</1>",
		},
		{
			why: "nested tags",
			source: "<0>a <1>b</1></0>",
			translation: "<0><1>B</1> A</0>",
		},
		{
			why: "empty tag kept empty",
			source: "made by <0></0>",
			translation: "<0></0> tarafından",
		},
		{
			why: "self closing tag",
			source: "line<br/>break",
			translation: "Zeile<br/>Umbruch",
		},
		{
			why: "named tag",
			source: "Let the <scannerLink>Scanner</scannerLink> fill this in",
			translation: "Lass den <scannerLink>Scanner</scannerLink> das ausfüllen",
		},
		{
			why: "lone less-than sign",
			source: "a < b",
			translation: "a < b",
		},
		{
			why: "angle bracket quotes",
			source: "Browse >>lfg<<",
			translation: "Consultez >>lfg<<",
		},
		{
			why: "less-than sign before a digit",
			source: "I love it",
			translation: "I <3 it",
		},
	])("accepts $why", ({ source, translation }) => {
		expect(TranslationSyntax.validate({ source, translation })).toEqual([]);
	});

	test.each([
		{
			why: "empty",
			source: "Save",
			translation: "  ",
			expected: [{ type: "EMPTY" }],
		},
		{
			why: "missing variable",
			source: "by {{author}}",
			translation: "von",
			expected: [{ type: "MISSING_PLACEHOLDER", placeholder: "{{author}}" }],
		},
		{
			why: "translated variable name",
			source: "by {{author}}",
			translation: "von {{autor}}",
			expected: [
				{ type: "MISSING_PLACEHOLDER", placeholder: "{{author}}" },
				{ type: "UNKNOWN_PLACEHOLDER", placeholder: "{{autor}}" },
			],
		},
		{
			why: "missing tag",
			source: "See <1>FAQ</1>",
			translation: "Siehe FAQ",
			expected: [{ type: "MISSING_PLACEHOLDER", placeholder: "<1></1>" }],
		},
		{
			why: "unknown tag",
			source: "See FAQ",
			translation: "Siehe <b>FAQ</b>",
			expected: [{ type: "UNKNOWN_PLACEHOLDER", placeholder: "<b></b>" }],
		},
		{
			why: "unclosed tag",
			source: "See <1>FAQ</1>",
			translation: "Siehe <1>FAQ",
			expected: [{ type: "BROKEN_TAGS" }],
		},
		{
			why: "crossing tags",
			source: "<0>a <1>b</1></0>",
			translation: "<0>a <1>b</0></1>",
			expected: [{ type: "BROKEN_TAGS" }],
		},
		{
			why: "content in a tag that must be empty",
			source: "made by <0></0>",
			translation: "von <0>jemandem</0>",
			expected: [{ type: "TAG_MUST_BE_EMPTY", placeholder: "<0></0>" }],
		},
		{
			why: "missing nesting",
			source: "$t(common:x) and more",
			translation: "und mehr",
			expected: [{ type: "MISSING_PLACEHOLDER", placeholder: "$t(common:x)" }],
		},
		{
			why: "tag with attributes",
			source: "See <1>FAQ</1>",
			translation: "<img src=x onerror=alert(1)>Siehe <1>FAQ</1>",
			expected: [{ type: "UNSUPPORTED_MARKUP" }],
		},
		{
			why: "source tag with attributes",
			source: "Let the <scannerLink>Scanner</scannerLink> fill this in",
			translation:
				'Lass den <scannerLink onclick="x">Scanner</scannerLink> das ausfüllen',
			expected: [{ type: "UNSUPPORTED_MARKUP" }, { type: "BROKEN_TAGS" }],
		},
		{
			why: "tag without a closing bracket",
			source: "See FAQ",
			translation: "Siehe <svg/onload=alert(1) FAQ",
			expected: [{ type: "UNSUPPORTED_MARKUP" }],
		},
		{
			why: "HTML comment",
			source: "See FAQ",
			translation: "Siehe <!-- x --> FAQ",
			expected: [{ type: "UNSUPPORTED_MARKUP" }],
		},
	])("rejects $why", ({ source, translation, expected }) => {
		expect(TranslationSyntax.validate({ source, translation })).toEqual(
			expected,
		);
	});

	test("count is optional in a plural form", () => {
		expect(
			TranslationSyntax.validate({
				source: "{{count}} viewer",
				translation: "ein Zuschauer",
				isPlural: true,
			}),
		).toEqual([]);
	});

	test("count can be added to a plural form", () => {
		expect(
			TranslationSyntax.validate({
				source: "mutual friend",
				translation: "{{count}} gemeinsamer Freund",
				isPlural: true,
			}),
		).toEqual([]);
	});

	test("count is required outside of plural forms", () => {
		expect(
			TranslationSyntax.validate({
				source: "<0></0> of {{count}} teams",
				translation: "<0></0> von Teams",
			}),
		).toEqual([{ type: "MISSING_PLACEHOLDER", placeholder: "{{count}}" }]);
	});
});

describe("TranslationSyntax.placeholders", () => {
	test.each([
		{ why: "no placeholders", text: "Save", expected: [] },
		{
			why: "in order of appearance",
			text: "See <1>FAQ</1> for {{what}} and {{what}}",
			expected: ["<1></1>", "{{what}}"],
		},
		{
			why: "self closing tag and nesting",
			text: "a<br/>$t(common:x)",
			expected: ["<br/>", "$t(common:x)"],
		},
	])("$why", ({ text, expected }) => {
		expect(TranslationSyntax.placeholders(text)).toEqual(expected);
	});
});

describe("TranslationSyntax.segments", () => {
	test("splits text and placeholders", () => {
		expect(TranslationSyntax.segments("by <0>{{name}}</0>!")).toEqual([
			{ text: "by ", isPlaceholder: false },
			{ text: "<0>", isPlaceholder: true },
			{ text: "{{name}}", isPlaceholder: true },
			{ text: "</0>", isPlaceholder: true },
			{ text: "!", isPlaceholder: false },
		]);
	});
});
