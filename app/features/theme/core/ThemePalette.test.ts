import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { CustomTheme } from "~/db/tables-json";
import { isInSrgbGamut, type Oklch } from "~/utils/oklch-gamut";
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

	test("vars.css resolves every color to the same value as resolveColors", () => {
		const css = varsCssColors();
		const { base, dark, light } = ThemePalette.resolveColors(built());
		const kebab = (key: string) =>
			key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
		const expectColor = (label: string, actual: Oklch, expected: Oklch) => {
			expect(actual.l, `${label} lightness`).toBeCloseTo(expected.l, 6);
			expect(actual.c, `${label} chroma`).toBeCloseTo(expected.c, 6);
			expect(actual.h, `${label} hue`).toBeCloseTo(expected.h, 6);
		};

		for (const [mode, colors] of [
			["dark", dark],
			["light", light],
		] as const) {
			for (const [key, color] of Object.entries(colors)) {
				const name = `--color-${kebab(key)}`;
				expectColor(`${mode} ${name}`, css.resolve(name, mode), color);
			}
		}
		for (const [index, color] of base.entries()) {
			if (index < 5) {
				expectColor(
					`dark base-${index}`,
					css.resolve(`--color-base-${index}`, "dark"),
					color,
				);
			}
			expectColor(
				`light base-${7 - index}`,
				css.resolve(`--color-base-${7 - index}`, "light"),
				color,
			);
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

const VARS_CSS = readFileSync(
	new URL("../../../styles/vars.css", import.meta.url),
	"utf8",
).replace(/\r\n/g, "\n");

type VarsBlock = "defaults" | "dark" | "light" | "semantic";

/** Custom property declarations of the top level blocks of vars.css, keyed by what the block is for */
function varsCssBlocks() {
	const blocks = new Map<VarsBlock, Map<string, string>>();
	const blockFor = (selector: string): VarsBlock | null => {
		const lastLine = selector.trim().split("\n").at(-1)!;
		if (lastLine.includes("[data-default-theme]")) return "defaults";
		if (lastLine.includes('[data-theme="dark"]')) return "dark";
		if (lastLine.includes('[data-theme="light"]')) return "light";
		if (lastLine === "[data-theme]") return "semantic";
		return null;
	};

	for (const [, selector, body] of VARS_CSS.matchAll(
		/^([^{}]+?)\{\n([^{}]*)\n\}/gm,
	)) {
		const block = blockFor(selector);
		if (!block) continue;

		const declarations = new Map<string, string>();
		for (const [, key, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
			declarations.set(key, value.replace(/\s+/g, " ").trim());
		}
		blocks.set(block, declarations);
	}

	return blocks;
}

/** Theme variable defaults from vars.css, `var()` references resolved */
function varsCssThemeDefaults() {
	const raw = varsCssBlocks().get("defaults")!;

	const resolve = (value: string): number => {
		const reference = value.match(/^var\((--_[\w-]+)\)$/);
		if (reference) return resolve(raw.get(reference[1])!);

		return Number(value);
	};

	return Object.fromEntries(
		[...raw.entries()].map(([key, value]) => [key, resolve(value)]),
	);
}

/** Evaluates the oklch() colors of vars.css for a color scheme the way the browser would */
function varsCssColors() {
	const blocks = varsCssBlocks();

	const lookup = (name: string, mode: "dark" | "light"): string => {
		const value =
			blocks.get(mode)?.get(name) ??
			blocks.get("semantic")?.get(name) ??
			blocks.get("defaults")?.get(name);
		if (value === undefined)
			throw new Error(`${name} is not defined for ${mode}`);

		return value;
	};

	const substituteVars = (value: string, mode: "dark" | "light"): string => {
		let result = value;
		while (result.includes("var(")) {
			result = result.replace(/var\((--[\w-]+)\)/g, (_, name) =>
				lookup(name, mode),
			);
		}

		return result;
	};

	const evaluate = (expression: string): number => {
		const arithmetic = expression
			.replaceAll("calc", "")
			.replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
		if (!/^[\d\s.+\-*/()]+$/.test(arithmetic)) {
			throw new Error(`cannot evaluate ${expression}`);
		}

		return new Function(`return ${arithmetic}`)();
	};

	const splitTopLevel = (value: string) => {
		const parts: string[] = [];
		let depth = 0;
		let current = "";
		for (const char of value) {
			if (char === "(") depth++;
			if (char === ")") depth--;
			if (char === " " && depth === 0) {
				if (current) parts.push(current);
				current = "";
			} else {
				current += char;
			}
		}
		if (current) parts.push(current);

		return parts;
	};

	const resolve = (name: string, mode: "dark" | "light"): Oklch => {
		const value = substituteVars(lookup(name, mode), mode);
		const inner = value.match(/^oklch\((.*)\)$/s)?.[1];
		if (!inner)
			throw new Error(
				`${name} does not resolve to oklch() for ${mode}: ${value}`,
			);
		const [l, c, h] = splitTopLevel(inner.trim()).map(evaluate);

		return { l, c, h };
	};

	return { resolve };
}
