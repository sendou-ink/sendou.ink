import { beforeEach, describe, expect, test } from "vitest";
import { EngineBracket } from "../test-utils";

const bracket = new EngineBracket();

describe("Create double elimination stage", () => {
	beforeEach(() => {
		bracket.reset();
	});

	test("should create a double elimination stage", () => {
		bracket.create({
			name: "Amateur",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: { seedOrdering: ["natural"], grandFinal: "simple" },
		});

		const stage = bracket.stage();
		expect(stage.name).toBe("Amateur");
		expect(stage.type).toBe("double_elimination");

		expect(bracket.groups().length).toBe(3);
		expect(bracket.rounds().length).toBe(4 + 6 + 1);
		expect(bracket.matches().length).toBe(30);
	});

	test("should create a tournament with 256+ tournaments", () => {
		bracket.create({
			name: "Example with 256 participants",
			tournamentId: 0,
			type: "double_elimination",
			settings: { size: 256 },
		});
	});

	test("should create a tournament with a double grand final", () => {
		bracket.create({
			name: "Example with double grand final",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { grandFinal: "double", seedOrdering: ["natural"] },
		});

		expect(bracket.groups().length).toBe(3);
		expect(bracket.rounds().length).toBe(3 + 4 + 2);
		expect(bracket.matches().length).toBe(15);
	});
});
