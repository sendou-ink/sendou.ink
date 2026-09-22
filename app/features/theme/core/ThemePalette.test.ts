import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { CustomTheme } from "~/db/tables-json";
import { isInSrgbGamut } from "~/utils/oklch-gamut";
import { THEME_INPUT_LIMITS } from "~/utils/schema";
import * as ThemePalette from "./ThemePalette";

const input = (overrides: Partial<ThemePalette.ThemeInput> = {}) => ({
	...ThemePalette.DEFAULT_THEME_INPUT,
	...overrides,
});

const built = (overrides: Partial<ThemePalette.ThemeInput> = {}) =>
	ThemePalette.build(input(overrides));

describe("ThemePalette.build", () => {
	test("reproduces the defaults of vars.css for the default input", () => {
		const cssDefaults = varsCssThemeDefaults();
		const theme = built();

		expect(Object.keys(cssDefaults).length).toBeGreaterThan(50);
		for (const [key, value] of Object.entries(cssDefaults)) {
			expect(theme[key as keyof CustomTheme], key).toBeCloseTo(value, 10);
		}
	});

	test("every text color has at least WCAG AA contrast for any input", () => {
		const failures: string[] = [];

		for (const sample of sampledInputs()) {
			for (const pair of ThemePalette.textContrastPairs(built(sample))) {
				if (pair.contrast >= 4.5) continue;

				failures.push(
					`${pair.name} ${pair.contrast.toFixed(2)} ${JSON.stringify(sample)}`,
				);
			}
		}

		expect(failures).toEqual([]);
	});

	test("every color is inside the sRGB gamut for any input", () => {
		const failures: string[] = [];

		for (const sample of sampledInputs()) {
			const { base, dark, light } = ThemePalette.resolveColors(built(sample));
			const colors = [
				...base.map((color, index) => [`base-${index}`, color] as const),
				...Object.entries(dark).map(
					([name, color]) => [`dark ${name}`, color] as const,
				),
				...Object.entries(light).map(
					([name, color]) => [`light ${name}`, color] as const,
				),
			];

			for (const [name, color] of colors) {
				if (isInSrgbGamut(color)) continue;

				failures.push(
					`${name} ${JSON.stringify(color)} ${JSON.stringify(sample)}`,
				);
			}
		}

		expect(failures).toEqual([]);
	});

	test("gives a yellow accent a bright light mode fill with dark text on it", () => {
		const theme = built({ accentHue: 100, accentChroma: 0.3 });

		expect(theme["--_acc-fill-dark-text"]).toBe(1);
		expect(theme["--_acc-l-6"]).toBeGreaterThan(0.8);
	});

	test("keeps the default accent's light mode fill as its text color with white text on it", () => {
		const theme = built();

		expect(theme["--_acc-fill-dark-text"]).toBe(0);
		expect(theme["--_acc-l-6"]).toBe(theme["--_acc-l-4"]);
	});

	test("gives the default theme's amber secondary a bright light mode fill with dark text on it", () => {
		const theme = built();

		expect(theme["--_second-fill-dark-text"]).toBe(1);
		expect(theme["--_second-l-6"]).toBeGreaterThan(0.8);
	});

	test("keeps a yellow accent's blue secondary fill as its text color with white text on it", () => {
		const theme = built({ accentHue: 100 });

		expect(theme["--_second-fill-dark-text"]).toBe(0);
		expect(theme["--_second-l-6"]).toBe(theme["--_second-l-4"]);
	});

	test("raises a yellow dark mode accent to where yellow is at its most vivid", () => {
		const theme = built({ accentHue: 100 });

		expect(theme["--_acc-l-2"]).toBeGreaterThan(0.88);
		expect(theme["--_acc-c-2"]).toBeGreaterThan(0.15);
	});

	test("rotates dark shades of yellow toward amber", () => {
		const theme = built({ accentHue: 100 });

		expect(theme["--_acc-h-4"]).toBeLessThan(85);
		expect(theme["--_acc-h-2"]).toBe(100);
	});
});

describe("ThemePalette.toThemeInput", () => {
	test.each([
		{ why: "default", overrides: {} },
		{
			why: "yellow",
			overrides: { accentHue: 100, accentChroma: 0.3, bgLightness: 0.08 },
		},
		{
			why: "gray",
			overrides: { baseChroma: 0, accentChroma: 0, bgLightness: 0.12 },
		},
	])("recovers the input of a $why theme", ({ overrides }) => {
		const recovered = ThemePalette.toThemeInput(built(overrides));

		for (const [key, value] of Object.entries(input(overrides))) {
			if (typeof value === "number") {
				expect(
					recovered[key as keyof ThemePalette.ThemeInput],
					key,
				).toBeCloseTo(value, 6);
			} else {
				expect(recovered[key as keyof ThemePalette.ThemeInput], key).toBe(
					value,
				);
			}
		}
	});
});

function* sampledInputs() {
	const { BG_LIGHTNESS_MIN, BG_LIGHTNESS_MAX } = THEME_INPUT_LIMITS;

	for (let baseHue = 0; baseHue < 360; baseHue += 30) {
		for (const baseChroma of [0, 0.025, 0.05, 0.075, 0.1]) {
			for (let accentHue = 0; accentHue < 360; accentHue += 5) {
				for (const accentChroma of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
					for (const bgLightness of [
						BG_LIGHTNESS_MIN,
						(BG_LIGHTNESS_MIN + BG_LIGHTNESS_MAX) / 2,
						BG_LIGHTNESS_MAX,
					]) {
						yield { baseHue, baseChroma, accentHue, accentChroma, bgLightness };
					}
				}
			}
		}
	}
}

/** Theme variable defaults from vars.css, `var()` references resolved */
function varsCssThemeDefaults() {
	const css = readFileSync(
		new URL("../../../styles/vars.css", import.meta.url),
		"utf8",
	);
	const blocks = [
		...css.matchAll(/^html,\n\[data-default-theme\][^{]*\{([^}]*)\}/gm),
	];

	const raw = new Map<string, string>();
	for (const block of blocks) {
		for (const [, key, value] of block[1].matchAll(
			/(--_[\w-]+):\s*([^;]+);/g,
		)) {
			raw.set(key, value.trim());
		}
	}

	const resolve = (value: string): number => {
		const reference = value.match(/^var\((--_[\w-]+)\)$/);
		if (reference) return resolve(raw.get(reference[1])!);

		return Number(value);
	};

	return Object.fromEntries(
		[...raw.entries()].map(([key, value]) => [key, resolve(value)]),
	);
}
