import { describe, expect, test } from "vitest";
import { createResolved } from "./index";

describe("Create double elimination stage", () => {
	test("creates a double elimination stage", () => {
		const data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {},
		});

		expect(data.stage[0].type).toBe("double_elimination");

		expect(data.group.length).toBe(3);
		expect(data.round.length).toBe(4 + 6 + 2);
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

		expect(data.group.length).toBe(3);
		expect(data.round.length).toBe(3 + 4 + 2);
		expect(data.match.length).toBe(15);
	});
});
