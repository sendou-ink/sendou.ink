import { describe, expect, test } from "vitest";
import { stripDisabledEffects } from "./model-analysis";

const SOURCE = { graph: { children: [] }, texture: {}, metadata: {} };

describe("stripDisabledEffects", () => {
	test.each([
		{
			why: "drops disabled effects and keeps enabled ones",
			extras: {
				bloom: { enabled: true, intensity: 2 },
				noise: { enabled: false, amount: 0.5 },
				vignette: { intensity: 1 },
			},
			expected: { bloom: { enabled: true, intensity: 2 } },
		},
		{
			why: "leaves an empty extras group empty",
			extras: {},
			expected: {},
		},
		{
			why: "adds an empty extras group when the state has none",
			extras: undefined,
			expected: {},
		},
	])("$why", ({ extras, expected }) => {
		const state = { source: SOURCE, model: { outlineSize: 2 }, extras };

		const stripped = JSON.parse(stripDisabledEffects(JSON.stringify(state)));

		expect(stripped).toEqual({
			source: SOURCE,
			model: { outlineSize: 2 },
			extras: expected,
		});
	});

	test("compacts pretty printed JSON", () => {
		const pretty = JSON.stringify({ source: SOURCE, extras: {} }, null, 2);

		expect(stripDisabledEffects(pretty)).toBe(
			JSON.stringify({ source: SOURCE, extras: {} }),
		);
	});

	test.each([
		{ why: "invalid JSON", model: "{not json" },
		{ why: "a JSON array", model: "[1, 2]" },
		{ why: "a JSON string", model: '"text"' },
	])("returns $why untouched", ({ model }) => {
		expect(stripDisabledEffects(model)).toBe(model);
	});
});
