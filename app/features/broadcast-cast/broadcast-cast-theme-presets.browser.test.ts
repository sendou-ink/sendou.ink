// a browser test: the presets are read with `?raw`, which the unit tests don't load
import { describe, expect, test } from "vitest";
import {
	BROADCAST_THEME_PRESETS,
	presetKeyOf,
	withPresetSettings,
} from "./broadcast-cast-theme-presets";

describe("presetKeyOf", () => {
	test.each(BROADCAST_THEME_PRESETS)(
		"names $key as loaded in the designer",
		(preset) => {
			expect(
				presetKeyOf({ css: preset.css, variables: preset.variables }),
			).toBe(preset.key);
		},
	);

	test.each(BROADCAST_THEME_PRESETS)(
		"names $key saved whole before the designer had settings",
		(preset) => {
			expect(presetKeyOf({ css: preset.source, variables: {} })).toBe(
				preset.key,
			);
		},
	);

	test.each(BROADCAST_THEME_PRESETS)(
		"is null for $key with a setting changed",
		(preset) => {
			const [name] = Object.keys(preset.variables);

			expect(
				presetKeyOf({
					css: preset.css,
					variables: { ...preset.variables, [name!]: "1px" },
				}),
			).toBeNull();
		},
	);

	test("is null for the default styles", () => {
		expect(presetKeyOf({ css: "", variables: {} })).toBeNull();
	});
});

describe("withPresetSettings", () => {
	test.each(BROADCAST_THEME_PRESETS)(
		"splits $key saved whole to its settings and custom CSS",
		(preset) => {
			expect(withPresetSettings({ css: preset.source, variables: {} })).toEqual(
				{ css: preset.css, variables: preset.variables },
			);
		},
	);

	test("leaves a theme of one's own as it is", () => {
		const theme = {
			css: "[data-broadcast] { --bc-bg: #000; }",
			variables: {},
		};

		expect(withPresetSettings(theme)).toBe(theme);
	});

	test("leaves a preset with settings set as it is", () => {
		const [preset] = BROADCAST_THEME_PRESETS;
		const theme = { css: preset!.source, variables: { "--bc-bg": "#000" } };

		expect(withPresetSettings(theme)).toBe(theme);
	});
});
