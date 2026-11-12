import { describe, expect, test } from "vitest";
import { isUnitTestFile, testCandidatesOf } from "./test-selection.ts";

const graphOf = (edges: Record<string, string[]>) =>
	new Map(
		Object.entries(edges).map(([imported, importers]) => [
			imported,
			new Set(importers),
		]),
	);

describe("testCandidatesOf", () => {
	test("finds test files importing the target directly and through a chain", () => {
		const graph = graphOf({
			"target.ts": ["direct.test.ts", "middle.ts"],
			"middle.ts": ["chained.test.ts"],
		});

		expect(testCandidatesOf("target.ts", graph)).toEqual([
			{ file: "direct.test.ts", distance: 1 },
			{ file: "chained.test.ts", distance: 2 },
		]);
	});

	test("keeps the shortest distance of a test file reachable by several paths", () => {
		const graph = graphOf({
			"target.ts": ["left.ts", "right.ts", "deep.ts"],
			"left.ts": ["diamond.test.ts"],
			"right.ts": ["diamond.test.ts"],
			"deep.ts": ["deeper.ts"],
			"deeper.ts": ["diamond.test.ts"],
		});

		expect(testCandidatesOf("target.ts", graph)).toEqual([
			{ file: "diamond.test.ts", distance: 2 },
		]);
	});

	test("terminates on an import cycle", () => {
		const graph = graphOf({
			"target.ts": ["a.ts"],
			"a.ts": ["b.ts"],
			"b.ts": ["a.ts", "target.ts", "cycle.test.ts"],
		});

		expect(testCandidatesOf("target.ts", graph)).toEqual([
			{ file: "cycle.test.ts", distance: 3 },
		]);
	});

	test("orders test files of the same distance by name", () => {
		const graph = graphOf({
			"target.ts": ["z.test.ts", "a.test.ts", "m.test.ts"],
		});

		expect(
			testCandidatesOf("target.ts", graph).map((candidate) => candidate.file),
		).toEqual(["a.test.ts", "m.test.ts", "z.test.ts"]);
	});

	test("leaves out importers the unit run does not execute", () => {
		const graph = graphOf({
			"target.ts": [
				"helper.ts",
				"e2e/flow.test.ts",
				"app/Component.browser.test.tsx",
			],
		});

		expect(testCandidatesOf("target.ts", graph)).toEqual([]);
	});

	test("returns nothing for a target no file imports", () => {
		expect(testCandidatesOf("target.ts", graphOf({}))).toEqual([]);
	});
});

describe("isUnitTestFile", () => {
	test.each([
		{ file: "app/features/a/A.test.ts", expected: true },
		{ file: "app/features/a/A.test.tsx", expected: true },
		{ file: "app/features/scanner/tests/logic/x.test.ts", expected: true },
		{ file: "app/features/a/A.ts", expected: false },
		{ file: "app/features/a/A.browser.test.tsx", expected: false },
		{ file: "e2e/tournament.test.ts", expected: false },
		{ file: "app/features/scanner/tests/golden.test.ts", expected: false },
	])("$file → $expected", ({ file, expected }) => {
		expect(isUnitTestFile(file)).toBe(expected);
	});
});
