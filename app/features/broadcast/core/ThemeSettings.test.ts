import { describe, expect, test } from "vitest";
import * as ThemeSettings from "./ThemeSettings";

const SCENE_SOURCE = `/* Sizes and spots of the game scene */
:global([data-broadcast]) {
	--game-info-top: 28px;
	--game-bg: #090f1e;
	/* how long the map intro stays up */
	--game-intro-duration: 8s;
	--game-weight: 700;
	--game-padding: 48px 80px;
	--game-font: lexend, sans-serif;
	--game-backdrop-image: none;
}

.infoCard {
	--not-a-setting: 1px;
	top: var(--game-info-top);
}
`;

describe("ThemeSettings.settingsOf", () => {
	test("reads the variable block's settings with their kind, unit and hint", () => {
		expect(ThemeSettings.settingsOf({ source: SCENE_SOURCE })).toEqual([
			{
				name: "--game-info-top",
				defaultValue: "28px",
				kind: "number",
				unit: "px",
				hint: null,
			},
			{
				name: "--game-bg",
				defaultValue: "#090f1e",
				kind: "color",
				unit: null,
				hint: null,
			},
			{
				name: "--game-intro-duration",
				defaultValue: "8s",
				kind: "number",
				unit: "s",
				hint: "how long the map intro stays up",
			},
			{
				name: "--game-weight",
				defaultValue: "700",
				kind: "number",
				unit: null,
				hint: null,
			},
			{
				name: "--game-padding",
				defaultValue: "48px 80px",
				kind: "text",
				unit: null,
				hint: null,
			},
			{
				name: "--game-font",
				defaultValue: "lexend, sans-serif",
				kind: "font",
				unit: null,
				hint: null,
			},
			{
				name: "--game-backdrop-image",
				defaultValue: "none",
				kind: "image",
				unit: null,
				hint: null,
			},
		]);
	});

	test("reads the block of the given selector", () => {
		expect(
			ThemeSettings.settingsOf({
				source: ".canvas { --bc-radius: 12px; color: red; }",
				selector: ".canvas",
			}).map((setting) => setting.name),
		).toEqual(["--bc-radius"]);
	});

	test("is empty for a stylesheet without a variable block", () => {
		expect(ThemeSettings.settingsOf({ source: ".a { --b: 1px; }" })).toEqual(
			[],
		);
	});
});

describe("ThemeSettings.block", () => {
	test("sets the variables on the canvas", () => {
		expect(
			ThemeSettings.block({ "--bc-bg": "#000", "--game-info-top": "40px" }),
		).toBe("[data-broadcast] {\n\t--bc-bg: #000;\n\t--game-info-top: 40px;\n}");
	});

	test("is empty without variables", () => {
		expect(ThemeSettings.block({})).toBe("");
	});

	test("leaves out values that would end the block early", () => {
		expect(
			ThemeSettings.block({ "--a": "red; } body { color: red", "--b": "1px" }),
		).toBe("[data-broadcast] {\n\t--b: 1px;\n}");
	});
});

describe("ThemeSettings.isValidValue", () => {
	test.each([
		{ value: "#fff", expected: true },
		{ value: "rgb(255 255 255 / 0.5)", expected: true },
		{ value: '"Space Grotesk", sans-serif', expected: true },
		{ value: 'url("https://example.com/a.png")', expected: true },
		{ value: "", expected: false },
		{ value: "red;", expected: false },
		{ value: "red }", expected: false },
		{ value: "rgb(0 0 0", expected: false },
		{ value: "0)", expected: false },
		{ value: '"open', expected: false },
		{ value: '"\\201C"', expected: true },
		{ value: '"a /* b; [c"', expected: false },
		{ value: '"a /* b [c"', expected: true },
		{ value: "a /* b", expected: false },
		{ value: "a */", expected: false },
		{ value: "[x", expected: false },
		{ value: "x]", expected: false },
		{ value: "(a]", expected: false },
		{ value: "red \\", expected: false },
		{ value: '"ends escaped\\"', expected: false },
		{ value: "red\nblue", expected: false },
	])("$value is $expected", ({ value, expected }) => {
		expect(ThemeSettings.isValidValue(value)).toBe(expected);
	});
});

describe("ThemeSettings.extract", () => {
	const names = new Set(["--bc-bg", "--bc-radius", "--game-bar-height"]);

	test("takes the settings out of the [data-broadcast] rule, leaving the rest", () => {
		const css = `/* MY THEME */

/* 1. Variables */
[data-broadcast] {
	--bc-bg: #f3ecdc;
	--bc-radius: 0;

	/* the theme's own */
	--my-shadow: 8px 8px 0 #000;

	/* sizes and spots */
	--game-bar-height: 62px;

	font-synthesis: none;
}

[data-part="team-name"] {
	--bc-bg: red;
}`;

		expect(ThemeSettings.extract({ css, names })).toEqual({
			variables: {
				"--bc-bg": "#f3ecdc",
				"--bc-radius": "0",
				"--game-bar-height": "62px",
			},
			css: `/* MY THEME */

/* 1. Variables */
[data-broadcast] {
	/* the theme's own */
	--my-shadow: 8px 8px 0 #000;

	font-synthesis: none;
}

[data-part="team-name"] {
	--bc-bg: red;
}`,
		});
	});

	test("removes a rule left empty along with the comment heading it", () => {
		expect(
			ThemeSettings.extract({
				css: "/* variables */\n[data-broadcast] {\n\t--bc-bg: #000;\n}\n\n.a { top: 0; }",
				names,
			}),
		).toEqual({ variables: { "--bc-bg": "#000" }, css: ".a { top: 0; }" });
	});

	test("leaves CSS that doesn't parse whole", () => {
		const css = "[data-broadcast] { --bc-bg: #000;";

		expect(ThemeSettings.extract({ css, names })).toEqual({
			variables: {},
			css,
		});
	});

	test("round trips through the saved block to the same variables", () => {
		const variables = { "--bc-bg": "#000", "--game-bar-height": "50px" };

		expect(
			ThemeSettings.extract({ css: ThemeSettings.block(variables), names }),
		).toEqual({ variables, css: "" });
	});
});

describe("ThemeSettings.numberOf", () => {
	test.each([
		{ value: "28px", unit: "px" as const, expected: 28 },
		{ value: "0", unit: "px" as const, expected: 0 },
		{ value: "0.5s", unit: "s" as const, expected: 0.5 },
		{ value: "600", unit: null, expected: 600 },
		{ value: "500ms", unit: "s" as const, expected: null },
		{ value: "calc(1px + 2px)", unit: "px" as const, expected: null },
	])("$value in $unit is $expected", ({ value, unit, expected }) => {
		expect(ThemeSettings.numberOf(value, unit)).toBe(expected);
	});
});

describe("ThemeSettings.imageValue", () => {
	test("quotes the URL, escaping what would end it", () => {
		const value = ThemeSettings.imageValue('https://example.com/a b".png');

		expect(value).toBe('url("https://example.com/a%20b%22.png")');
		expect(ThemeSettings.imageUrlOf(value)).toBe(
			"https://example.com/a%20b%22.png",
		);
	});
});
