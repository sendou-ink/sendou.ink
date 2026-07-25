import { describe, expect, test } from "vitest";
import type { BracketData } from "../types";
import { createResolved } from "./index";

describe("Create single elimination stage", () => {
	test("should create a single elimination stage", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {},
		});

		expect(data.stage[0].type).toBe("single_elimination");

		expect(data.group.length).toBe(1);
		expect(data.round.length).toBe(4);
		expect(data.match.length).toBe(15);
	});

	test("should create a single elimination stage with BYEs", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, null, 3, 4, null, null, 7, 8],
			settings: {},
		});

		expect(matchById(data, 4).opponent1?.id).toBe(null);
		expect(matchById(data, 4).opponent2?.id).toBe(4);
		expect(matchById(data, 5).opponent1?.id).toBe(7);
		expect(matchById(data, 5).opponent2?.id).toBe(3);
	});

	test("should create a single elimination stage with consolation final", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { consolationFinal: true },
		});

		expect(data.group.length).toBe(2);
		expect(data.round.length).toBe(4);
		expect(data.match.length).toBe(8);
	});

	test("should create a single elimination stage with consolation final and BYEs", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [null, null, null, 4, 5, 6, 7, 8],
			settings: { consolationFinal: true },
		});

		expect(matchById(data, 4).opponent1?.id).toBe(8);
		expect(matchById(data, 4).opponent2?.id).toBe(null);

		// Consolation final
		expect(matchById(data, 7).opponent1?.id).toBe(null);
		expect(matchById(data, 7).opponent2?.id).toBe(null);
	});

	test("should create a single elimination stage with Bo3 matches", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});

		expect(data.group.length).toBe(1);
		expect(data.round.length).toBe(3);
		expect(data.match.length).toBe(7);
	});

	test("should throw if the seeding has duplicate participants", () => {
		expect(() =>
			createResolved({
				type: "single_elimination",
				seeding: [
					1,
					1, // Duplicate
					3,
					4,
				],
				settings: {},
			}),
		).toThrow("The seeding has a duplicate participant.");
	});
});

function matchById(data: BracketData, id: number) {
	const found = data.match.find((match) => match.id === id);
	if (!found) throw new Error(`Match ${id} not found`);

	return found;
}
