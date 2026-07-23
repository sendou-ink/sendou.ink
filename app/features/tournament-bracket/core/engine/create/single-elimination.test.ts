import { beforeEach, describe, expect, test } from "vitest";
import { EngineBracket } from "../test-utils";

const bracket = new EngineBracket();

describe("Create single elimination stage", () => {
	beforeEach(() => {
		bracket.reset();
	});

	test("should create a single elimination stage", () => {
		const example = {
			name: "Example",
			tournamentId: 0,
			type: "single_elimination" as const,
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {},
		};

		bracket.create(example);

		const stage = bracket.stage();
		expect(stage.name).toBe(example.name);
		expect(stage.type).toBe(example.type);

		expect(bracket.groups().length).toBe(1);
		expect(bracket.rounds().length).toBe(4);
		expect(bracket.matches().length).toBe(15);
	});

	test("should create a single elimination stage with BYEs", () => {
		bracket.create({
			name: "Example with BYEs",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, null, 3, 4, null, null, 7, 8],
			settings: {},
		});

		expect(bracket.match(4).opponent1?.id).toBe(null);
		expect(bracket.match(4).opponent2?.id).toBe(4);
		expect(bracket.match(5).opponent1?.id).toBe(7);
		expect(bracket.match(5).opponent2?.id).toBe(3);
	});

	test("should create a single elimination stage with consolation final", () => {
		bracket.create({
			name: "Example with consolation final",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { consolationFinal: true },
		});

		expect(bracket.groups().length).toBe(2);
		expect(bracket.rounds().length).toBe(4);
		expect(bracket.matches().length).toBe(8);
	});

	test("should create a single elimination stage with consolation final and BYEs", () => {
		bracket.create({
			name: "Example with consolation final and BYEs",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [null, null, null, 4, 5, 6, 7, 8],
			settings: { consolationFinal: true },
		});

		expect(bracket.match(4).opponent1?.id).toBe(8);
		expect(bracket.match(4).opponent2?.id).toBe(null);

		// Consolation final
		expect(bracket.match(7).opponent1?.id).toBe(null);
		expect(bracket.match(7).opponent2?.id).toBe(null);
	});

	test("should create a single elimination stage with Bo3 matches", () => {
		bracket.create({
			name: "Example with Bo3 matches",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});

		expect(bracket.groups().length).toBe(1);
		expect(bracket.rounds().length).toBe(3);
		expect(bracket.matches().length).toBe(7);
	});

	test("should throw if the seeding has duplicate participants", () => {
		expect(() =>
			bracket.create({
				name: "Example",
				tournamentId: 0,
				type: "single_elimination",
				seeding: [
					1,
					1, // Duplicate
					3,
					4,
				],
			}),
		).toThrow("The seeding has a duplicate participant.");
	});
});
