import { describe, expect, test } from "vitest";
import { truncateWithOverflow } from "./arrays";

describe("truncateWithOverflow", () => {
	test.each([
		{ why: "under max", length: 3, shown: 3, hiddenCount: 0 },
		{ why: "at max", length: 4, shown: 4, hiddenCount: 0 },
		{ why: "one over max shows all", length: 5, shown: 5, hiddenCount: 0 },
		{ why: "two over max", length: 6, shown: 4, hiddenCount: 2 },
	])("$why", ({ length, shown, hiddenCount }) => {
		const result = truncateWithOverflow(Array.from({ length }), 4);

		expect(result.shown).toHaveLength(shown);
		expect(result.hiddenCount).toBe(hiddenCount);
	});
});
