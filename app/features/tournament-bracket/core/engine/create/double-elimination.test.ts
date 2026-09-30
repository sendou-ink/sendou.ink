import { describe, expect, test } from "vitest";
import type { BracketData } from "../types";
import { createResolved } from "./index";

describe("Create double elimination stage", () => {
	test("creates a double elimination stage", () => {
		const data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {},
		});

		expect(data.stage[0].type).toBe("double_elimination");

		expect(data.group.length).toBe(1);
		expect(roundCountBySection(data)).toEqual({
			winners: 4,
			losers: 6,
			finals: 2,
		});
		expect(data.match.length).toBe(31);
	});

	test("creates a tournament with 256+ tournaments", () => {
		expect(() =>
			createResolved({
				type: "double_elimination",
				seeding: Array.from({ length: 256 }, (_, i) => i + 1),
				settings: {},
			}),
		).not.toThrow();
	});

	test("creates a tournament with a double grand final", () => {
		const data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});

		expect(data.group.length).toBe(1);
		expect(roundCountBySection(data)).toEqual({
			winners: 3,
			losers: 4,
			finals: 2,
		});
		expect(data.match.length).toBe(15);
	});
});

function roundCountBySection(data: BracketData) {
	const counts: Record<string, number> = {};
	for (const round of data.round) {
		counts[String(round.section)] = (counts[String(round.section)] ?? 0) + 1;
	}

	return counts;
}
