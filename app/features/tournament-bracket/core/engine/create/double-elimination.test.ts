import { beforeEach, describe, expect, test } from "vitest";
import { EngineBracket } from "../test-utils";

const bracket = new EngineBracket();

describe("Create double elimination stage", () => {
	beforeEach(() => {
		bracket.reset();
	});

	test("should create a double elimination stage", () => {
		bracket.create({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {},
		});

		const stage = bracket.stage();
		expect(stage.type).toBe("double_elimination");

		expect(bracket.groups().length).toBe(3);
		expect(bracket.rounds().length).toBe(4 + 6 + 2);
		expect(bracket.matches().length).toBe(31);
	});

	test("should create a tournament with 256+ tournaments", () => {
		bracket.create({
			type: "double_elimination",
			seeding: Array.from({ length: 256 }, (_, i) => i + 1),
		});
	});

	test("should create a tournament with a double grand final", () => {
		bracket.create({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});

		expect(bracket.groups().length).toBe(3);
		expect(bracket.rounds().length).toBe(3 + 4 + 2);
		expect(bracket.matches().length).toBe(15);
	});
});
