/**
 * Theme settings: the theme variables the designer sets in a form instead of CSS. Each is read off the variable
 * block of an overlay stylesheet (its default and what kind of value it takes) and the values set are saved apart from
 * the custom CSS, applied after it as one `[data-broadcast]` block so a value set in the form always wins.
 */
import { type ChildNode, parse, type Rule } from "postcss";

/** The selector of the block the settings are saved as, the overlay's canvas. */
const SETTINGS_SELECTOR = "[data-broadcast]";

/** The variable blocks of the scene stylesheets, on the canvas. */
const VARIABLE_BLOCK_SELECTOR = ":global([data-broadcast])";

const NUMBER = /^(-?(?:\d+\.?\d*|\.\d+))(px|ms|s)?$/;
const COLOR = /^(#[\da-f]{3,8}|(rgb|hsl|oklch|oklab|lab|lch)a?\(.*\))$/i;
const IMAGE_URL = /^url\(\s*"(.*)"\s*\)$/;

/**
 * The kind of value a setting takes, what input sets it: a color, a number in its `unit`, a font family, an image
 * (its URL) or any other value as text.
 */
type SettingKind = "color" | "number" | "font" | "image" | "text";

/** The unit of a `number` setting, `null` for a plain number (a font weight, say). */
export type SettingUnit = "px" | "ms" | "s" | null;

/** A theme variable set in the form. */
export interface ThemeSetting {
	name: string;
	/** Its value in the overlays' own styles. */
	defaultValue: string;
	kind: SettingKind;
	unit: SettingUnit;
	/** The comment above it, if any. */
	hint: string | null;
}

/** Values of the settings set, by variable name. The ones left out keep their default (or the custom CSS' value). */
export type ThemeVariables = Record<string, string>;

/**
 * The settings of an overlay stylesheet's module source: the custom properties its variable block declares, the
 * top-level rule of `selector` (`:global([data-broadcast])` by default, the scene stylesheets' "sizes and spots").
 */
export function settingsOf({
	source,
	selector = VARIABLE_BLOCK_SELECTOR,
}: {
	source: string;
	selector?: string;
}): ThemeSetting[] {
	const variableBlock = parse(source).nodes.find(
		(node): node is Rule =>
			node.type === "rule" && node.selector.trim() === selector,
	);
	if (!variableBlock) return [];

	const settings: ThemeSetting[] = [];
	let comment: string | null = null;
	for (const node of variableBlock.nodes) {
		if (node.type === "comment") {
			comment = node.text.trim();
			continue;
		}
		if (node.type === "decl" && node.prop.startsWith("--")) {
			const defaultValue = node.value.trim();
			const kind = kindOf(node.prop, defaultValue);

			settings.push({
				name: node.prop,
				defaultValue,
				kind,
				unit:
					kind === "number"
						? ((NUMBER.exec(defaultValue)?.[2] as SettingUnit) ?? null)
						: null,
				hint: comment,
			});
		}
		comment = null;
	}

	return settings;
}

/** The settings set as the CSS saved for them: one `[data-broadcast]` block, empty without any. */
export function block(variables: ThemeVariables) {
	const declarations = Object.entries(variables)
		.filter(([name, value]) => isValidName(name) && isValidValue(value))
		.map(([name, value]) => `\t${name}: ${value.trim()};`);
	if (declarations.length === 0) return "";

	return `${SETTINGS_SELECTOR} {\n${declarations.join("\n")}\n}`;
}

/**
 * Splits CSS (a preset's) to the settings it sets and the rest: the declarations of the named variables in its
 * top-level `[data-broadcast]` rules become settings, along with the comments heading only them, and the rest stays
 * CSS. CSS that doesn't parse stays whole.
 */
export function extract({
	css,
	names,
}: {
	css: string;
	names: ReadonlySet<string>;
}): { variables: ThemeVariables; css: string } {
	let root: ReturnType<typeof parse>;
	try {
		root = parse(css);
	} catch {
		return { variables: {}, css };
	}

	const variables: ThemeVariables = {};
	for (const rule of [...root.nodes]) {
		if (rule.type !== "rule" || rule.selector.trim() !== SETTINGS_SELECTOR) {
			continue;
		}

		const extracted = new Set<ChildNode>();
		for (const node of rule.nodes) {
			if (
				node.type === "decl" &&
				names.has(node.prop) &&
				!node.important &&
				isValidValue(node.value)
			) {
				variables[node.prop] = node.value.trim();
				extracted.add(node);
			}
		}
		if (extracted.size === 0) continue;

		for (const comment of commentsHeading(rule.nodes, extracted)) {
			comment.remove();
		}
		for (const node of extracted) node.remove();

		if (rule.nodes.every((node) => node.type === "comment")) {
			const previous = rule.prev();
			if (previous?.type === "comment") previous.remove();
			rule.remove();
		} else if (rule.first?.raws.before) {
			rule.first.raws.before = rule.first.raws.before.replace(/^\n+/, "\n");
		}
	}

	return {
		variables,
		css: root
			.toString()
			.replace(/\n{3,}/g, "\n\n")
			.trim(),
	};
}

/**
 * Whether the value can be saved as a setting's: one value, nothing ending its declaration or block early. Outside its
 * strings no comment, escape or unclosed bracket, which would carry over into the declarations after it.
 */
export function isValidValue(value: string) {
	if (!value.trim() || /[;{}\n]/.test(value)) return false;

	const outsideStrings = value.replace(
		/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g,
		"",
	);
	if (/["'\\]|\/\*|\*\//.test(outsideStrings)) return false;

	const closing: string[] = [];
	for (const character of outsideStrings) {
		if (character === "(") closing.push(")");
		if (character === "[") closing.push("]");
		if (
			(character === ")" || character === "]") &&
			closing.pop() !== character
		) {
			return false;
		}
	}

	return closing.length === 0;
}

/** Whether the name is a variable's (a custom property's). */
export function isValidName(name: string) {
	return /^--[a-z][\w-]*$/i.test(name);
}

/** The number a `number` setting's value is in its unit, `null` when it is something else (e.g. in another unit). */
export function numberOf(value: string, unit: SettingUnit) {
	const match = NUMBER.exec(value.trim());
	if (!match) return null;

	const number = Number(match[1]);
	const valueUnit = match[2] ?? null;
	if (valueUnit !== unit && !(number === 0 && unit === "px")) return null;

	return number;
}

/** A `number` setting's value of the number. */
export function numberValue(number: number, unit: SettingUnit) {
	return `${number}${unit ?? ""}`;
}

/** The URL an `image` setting's value shows, `null` for no image or a value of another form. */
export function imageUrlOf(value: string) {
	return IMAGE_URL.exec(value.trim())?.[1] ?? null;
}

/** An `image` setting's value showing the URL. */
export function imageValue(url: string) {
	return `url("${encodeURI(decodeURISafe(url.trim()))}")`;
}

function kindOf(name: string, value: string): SettingKind {
	if (/-font(-|$)/.test(name)) return "font";
	if (name.endsWith("-image")) return "image";
	if (COLOR.test(value)) return "color";
	if (NUMBER.test(value)) return "number";

	return "text";
}

/** The comments heading a run of nodes (up to the next comment or blank line) that are all extracted. */
function commentsHeading(
	nodes: ChildNode[],
	extracted: ReadonlySet<ChildNode>,
) {
	const comments: ChildNode[] = [];
	for (const [i, node] of nodes.entries()) {
		if (node.type !== "comment") continue;

		const runEnd = nodes.findIndex(
			(candidate, j) =>
				j > i + 1 &&
				(candidate.type === "comment" ||
					/\n[^\S\n]*\n/.test(candidate.raws.before ?? "")),
		);
		const run = nodes.slice(i + 1, runEnd === -1 ? undefined : runEnd);
		if (run.length > 0 && run.every((candidate) => extracted.has(candidate))) {
			comments.push(node);
		}
	}

	return comments;
}

function decodeURISafe(url: string) {
	try {
		return decodeURI(url);
	} catch {
		return url;
	}
}
