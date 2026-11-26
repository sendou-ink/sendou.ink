import fs from "node:fs";
import path from "node:path";
import { parse } from "postcss";
import { describe, expect, test } from "vitest";
import { BROADCAST_CSS_MAX_LENGTH } from "~/features/broadcast/broadcast-constants";
import * as ThemeCss from "~/features/broadcast/core/ThemeCss";
import * as ThemeSettings from "~/features/broadcast/core/ThemeSettings";
import {
	BROADCAST_SCENE_PARTS,
	BROADCAST_SCENES,
} from "./broadcast-cast-constants";

// read off the disk: the unit tests don't load stylesheets, so the presets can't be imported here
const PRESETS_DIR = path.join(import.meta.dirname, "presets");
const PRESETS = fs
	.readdirSync(PRESETS_DIR)
	.filter((file) => file.endsWith(".css"))
	.map((file) => ({
		key: path.basename(file, ".css"),
		css: fs.readFileSync(path.join(PRESETS_DIR, file), "utf8").trim(),
	}));

/** Left of the character limit for a producer's own edits on top of a preset. */
const ROOM_FOR_EDITS = 4_000;

const PARTS = new Set<string>([
	...Object.values(BROADCAST_SCENE_PARTS).flat(),
	"backdrop",
	"backdrop-video",
	"backdrop-vignette",
]);

const DEFAULT_CSS = [
	import.meta.dirname,
	path.join(import.meta.dirname, "../broadcast"),
]
	.flatMap((feature) =>
		fs
			.readdirSync(path.join(feature, "components"))
			.filter((file) => file.endsWith(".module.css"))
			.map((file) =>
				fs.readFileSync(path.join(feature, "components", file), "utf8"),
			),
	)
	.join("\n")
	.replaceAll(/:global\(([^)]*)\)/g, "$1");
const DEFAULT_VARIABLES = new Set(variablesOf(DEFAULT_CSS));
const DEFAULT_KEYFRAMES = new Set(keyframesOf(DEFAULT_CSS));

describe("BROADCAST_THEME_PRESETS", () => {
	test("has presets", () => {
		expect(PRESETS.length).toBeGreaterThan(0);
	});

	test.each(PRESETS)("$key parses", ({ css }) => {
		expect(ThemeCss.syntaxError(css)).toBeNull();
	});

	test.each(PRESETS)(
		"$key loads as settings and custom CSS that parses",
		({ css }) => {
			const loaded = ThemeSettings.extract({ css, names: DEFAULT_VARIABLES });

			expect(Object.keys(loaded.variables).length).toBeGreaterThan(0);
			expect(ThemeCss.syntaxError(loaded.css)).toBeNull();
		},
	);

	test.each(PRESETS)(
		"$key leaves room for edits under the character limit",
		({ css }) => {
			expect(css.length).toBeLessThanOrEqual(
				BROADCAST_CSS_MAX_LENGTH - ROOM_FOR_EDITS,
			);
		},
	);

	test.each(PRESETS)(
		"$key is all custom CSS, without the layer of stylesheet edits",
		({ css }) => {
			const layers: string[] = [];
			parse(css).walkAtRules("layer", (atRule) => {
				layers.push(atRule.params);
			});

			expect(layers).toEqual([]);
		},
	);

	// an animation can stop a hair short of its end and fill with the step before the jump, leaving the element hidden or cut
	test.each(PRESETS)(
		"$key has no steps() timing that jumps at the very end",
		({ css }) => {
			expect(css).not.toMatch(/steps\(\s*\d+\s*(,\s*(end|jump-end))?\s*\)/);
		},
	);

	test.each(PRESETS)(
		"$key selects only parts and scenes there are, no classes",
		({ css }) => {
			const selectors = selectorsOf(css).join("\n");

			expect(
				attributeValues(selectors, "data-part").filter(isUnknownPart),
			).toEqual([]);
			expect(
				attributeValues(selectors, "data-scene").filter(
					(scene) => !(BROADCAST_SCENES as readonly string[]).includes(scene),
				),
			).toEqual([]);
			expect(selectors).not.toMatch(/\.[A-Za-z]/);
		},
	);

	test.each(PRESETS)(
		"$key sets only variables of the default styles and its own",
		({ key, css }) => {
			const unknown = variablesOf(css).filter(
				(name) =>
					!DEFAULT_VARIABLES.has(name) && !name.startsWith(`--${own(key)}-`),
			);

			expect(unknown).toEqual([]);
		},
	);

	test.each(PRESETS)(
		"$key redefines only keyframes of the default styles besides its own",
		({ key, css }) => {
			const unknown = keyframesOf(css).filter(
				(name) =>
					!DEFAULT_KEYFRAMES.has(name) && !name.startsWith(`${own(key)}-`),
			);

			expect(unknown).toEqual([]);
		},
	);
});

/** The prefix of a preset's own variables and keyframes. */
function own(key: string) {
	return key === "teletext" ? "ttx" : key;
}

/** Suffix matches (`[data-part$="team-name"]`) count when a part ends with them. */
function isUnknownPart(part: string) {
	return (
		!PARTS.has(part) && !Array.from(PARTS).some((known) => known.endsWith(part))
	);
}

function selectorsOf(css: string) {
	const selectors: string[] = [];
	parse(css).walkRules((rule) => {
		const parent = rule.parent;
		if (
			parent?.type === "atrule" &&
			"name" in parent &&
			parent.name === "keyframes"
		) {
			return;
		}

		selectors.push(rule.selector);
	});

	return selectors;
}

function attributeValues(selectors: string, attribute: string) {
	return Array.from(
		selectors.matchAll(new RegExp(`\\[${attribute}[$^*]?="([^"]*)"\\]`, "g")),
		(match) => match[1]!,
	);
}

function variablesOf(css: string) {
	const names: string[] = [];
	parse(css).walkDecls(/^--/, (declaration) => {
		names.push(declaration.prop);
	});

	return names;
}

function keyframesOf(css: string) {
	const names: string[] = [];
	parse(css).walkAtRules("keyframes", (atRule) => {
		names.push(atRule.params.trim());
	});

	return names;
}
