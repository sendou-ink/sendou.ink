import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { mapModePreferencesValueSchema } from "./match-profile-schemas";

describe("mapModePreferencesValueSchema", () => {
	test("strips pools for avoided modes", () => {
		const result = v.parse(mapModePreferencesValueSchema, {
			modes: [
				{ mode: "SZ", preference: "PREFER" },
				{ mode: "TC", preference: "AVOID" },
			],
			pool: [
				{ mode: "SZ", stages: [1, 2] },
				{ mode: "TC", stages: [3, 4] },
			],
		});

		expect(result.pool).toEqual([{ mode: "SZ", stages: [1, 2] }]);
	});

	test("keeps pools for preferred and neutral modes", () => {
		const result = v.parse(mapModePreferencesValueSchema, {
			modes: [{ mode: "SZ", preference: "PREFER" }],
			pool: [
				{ mode: "SZ", stages: [1] },
				{ mode: "TC", stages: [2] },
			],
		});

		expect(result.pool).toEqual([
			{ mode: "SZ", stages: [1] },
			{ mode: "TC", stages: [2] },
		]);
	});

	test("does not mutate the modes selection", () => {
		const result = v.parse(mapModePreferencesValueSchema, {
			modes: [{ mode: "TC", preference: "AVOID" }],
			pool: [{ mode: "TC", stages: [1] }],
		});

		expect(result.modes).toEqual([{ mode: "TC", preference: "AVOID" }]);
		expect(result.pool).toEqual([]);
	});
});
