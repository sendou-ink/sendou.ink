import { describe, expect, test } from "vitest";
import { applyMutant, instrumentScopes, planMutations } from "./mutants.ts";

const mutatedSources = (source: string) => {
	const { mutants } = planMutations("source.ts", source);

	return mutants
		.filter((mutant) => mutant.ignoredReason === null)
		.map((mutant) => applyMutant(source, mutant));
};

describe("planMutations", () => {
	test.each([
		{
			why: "comparison boundary and direction",
			source: "const isUnder = a < b;",
			expected: ["const isUnder = a <= b;", "const isUnder = a >= b;"],
		},
		{
			why: "equality",
			source: "const isSame = a === b;",
			expected: ["const isSame = a !== b;"],
		},
		{
			why: "logical operator",
			source: "const both = a && b;",
			expected: ["const both = a || b;"],
		},
		{
			why: "arithmetic operator, parenthesized operands",
			source: "const sum = (a) + (b);",
			expected: ["const sum = (a) - (b);"],
		},
		{
			why: "compound assignment",
			source: "total += a;",
			expected: ["total -= a;"],
		},
		{
			why: "negation, parenthesized operand",
			source: "const isOpen = !(closed);",
			expected: ["const isOpen = (closed);"],
		},
		{
			why: "double negation is one mutant",
			source: "const has = !!value;",
			expected: ["const has = !value;"],
		},
		{
			why: "if condition both ways",
			source: "if (ready) start();",
			expected: ["if (true) start();", "if (false) start();", "if (ready) ;"],
		},
		{
			why: "ternary condition both ways",
			source: "const pick = ready ? a : b;",
			expected: ["const pick = true ? a : b;", "const pick = false ? a : b;"],
		},
		{
			why: "boolean literal",
			source: "const isOn = true;",
			expected: ["const isOn = false;"],
		},
		{
			why: "numeric literal",
			source: "const first = () => list[0];",
			expected: ["const first = () => list[1];"],
		},
		{
			why: "awaited call statement",
			source: "await save(a);",
			expected: [";"],
		},
	])("mutates $why", ({ source, expected }) => {
		expect(mutatedSources(source)).toEqual(expected);
	});

	test.each([
		{ why: "type positions", source: "type Limit = 1 | 2;" },
		{ why: "imports", source: 'import { a } from "./a.ts";' },
		{ why: "string concatenation", source: 'const label = "a" + b;' },
		{ why: "string appends", source: 'label += "suffix";' },
		{ why: "invariant calls", source: "invariant(a > 0 && !b);" },
		{ why: "logger calls", source: "logger.warn(a + 1);" },
		{ why: "assertUnreachable calls", source: "assertUnreachable(a);" },
		{ why: "thrown errors", source: "throw new Error(a + 1);" },
		{ why: "nullish defaults", source: "const count = a ?? 0;" },
		{ why: "tuning constants", source: "const MAX_ROUNDS = 10;" },
		{ why: "data tables", source: "export const seasons = [{ nth: 0 }];" },
		{ why: "object keys", source: "const names = { 1: a };" },
		{ why: "values used as values", source: "const result = compute(a);" },
	])("leaves $why alone", ({ source }) => {
		expect(mutatedSources(source)).toEqual([]);
	});

	test("mutates numbers of a module level constant's functions", () => {
		const source = "const RULES = { limit: () => 3 };";

		expect(mutatedSources(source)).toEqual([
			"const RULES = { limit: () => 4 };",
		]);
	});

	test("mutates the type-asserted expression but not the type", () => {
		const source = "const limit = () => (a + 1) as 2;";

		expect(mutatedSources(source)).toEqual([
			"const limit = () => (a - 1) as 2;",
			"const limit = () => (a + 2) as 2;",
		]);
	});

	test("groups mutants by the nearest named function", () => {
		const source = [
			"const TOP = !a;",
			"export function outer() {",
			"	return list.filter((item) => !item);",
			"}",
			"const helper = () => !b;",
			"class Bracket {",
			"	isOver() {",
			"		return !c;",
			"	}",
			"	#reset() {",
			"		return !d;",
			"	}",
			"}",
		].join("\n");

		expect(
			planMutations("source.ts", source).mutants.map((mutant) => [
				mutant.functionName,
				mutant.functionLine,
				mutant.line,
			]),
		).toEqual([
			["(module level)", 1, 1],
			["outer", 2, 3],
			["helper", 5, 5],
			["Bracket.isOver", 7, 8],
			["Bracket.#reset", 10, 11],
		]);
	});

	test("marks the mutants of the statement under an ignore comment", () => {
		const source = [
			"function weight() {",
			"	// mutation-ignore: tuning, any order is a valid pairing",
			"	const bonus = a > b ? 1 : 2;",
			"	return bonus + c;",
			"}",
		].join("\n");

		expect(
			planMutations("source.ts", source).mutants.map((mutant) => [
				mutant.line,
				mutant.ignoredReason,
			]),
		).toEqual([
			[3, "tuning, any order is a valid pairing"],
			[3, "tuning, any order is a valid pairing"],
			[3, "tuning, any order is a valid pairing"],
			[3, "tuning, any order is a valid pairing"],
			[3, "tuning, any order is a valid pairing"],
			[3, "tuning, any order is a valid pairing"],
			[4, null],
		]);
	});

	test("rejects an ignore comment without a reason", () => {
		expect(() =>
			planMutations("source.ts", "// mutation-ignore\nconst a = !b;"),
		).toThrow("needs a reason");
	});

	test("rejects an ignore comment that is not above a statement", () => {
		expect(() =>
			planMutations("source.ts", "const a = !b;\n// mutation-ignore: why\n"),
		).toThrow("directly above");
	});
});

describe("instrumentScopes", () => {
	test("reports the functions holding a mutant and the module itself", () => {
		const source = [
			"export function blockBody() {",
			"	return !a;",
			"}",
			"export const expressionBody = () => ({ isOn: !b });",
			"export const untouched = () => c;",
		].join("\n");

		expect(
			instrumentScopes(source, planMutations("source.ts", source), 7),
		).toBe(
			[
				"export function blockBody() {globalThis.__mutationHit?.(7, 1);",
				"	return !a;",
				"}",
				"export const expressionBody = () => ((globalThis.__mutationHit?.(7, 2), { isOn: !b }));",
				"export const untouched = () => c;",
				"globalThis.__mutationHit?.(7, 0);",
				"",
			].join("\n"),
		);
	});
});
