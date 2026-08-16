import { describe, expect, test } from "vitest";
import { divsSchema } from "./scrims-schemas";

describe("divsSchema", () => {
	test("swaps min and max when max is lower skill than min", () => {
		const result = divsSchema.parse({ min: "1", max: "10" });

		expect(result).toEqual({ min: "10", max: "1" });
	});

	test("keeps min and max when they are in correct order", () => {
		const result = divsSchema.parse({ min: "10", max: "1" });

		expect(result).toEqual({ min: "10", max: "1" });
	});

	test("keeps min and max when they are equal", () => {
		const result = divsSchema.parse({ min: "5", max: "5" });

		expect(result).toEqual({ min: "5", max: "5" });
	});
});
