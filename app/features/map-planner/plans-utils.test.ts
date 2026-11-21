import { describe, expect, test } from "vitest";
import * as PlanDocument from "./core/PlanDocument";
import { planFileName } from "./plans-utils";

describe("planFileName", () => {
	test.each([
		{
			stageId: 9,
			mode: "SZ",
			expected: "plan-sturgeon-shipyard-SZ-2026-11-21",
		},
		{
			stageId: 6,
			mode: "RM",
			expected: "plan-museum-d-alfonsino-RM-2026-11-21",
		},
		{
			stageId: 24,
			mode: "TW",
			expected: "plan-urchin-underpass-TW-2026-11-21",
		},
	] as const)("$expected", ({ stageId, mode, expected }) => {
		expect(
			planFileName(
				PlanDocument.empty({ stageId, mode }),
				new Date(2026, 10, 21, 23, 30),
			),
		).toBe(expected);
	});
});
