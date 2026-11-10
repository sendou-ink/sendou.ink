import {
	type AtRule,
	type ChildNode,
	type Container,
	CssSyntaxError,
	type Declaration,
	parse,
	type Rule,
} from "postcss";

/**
 * The cascade layer the overlays' own styles are in (see `vite-css-plugins.ts`). Edits of them go in it too, after
 * them, so an edited rule wins over the original one but not over the more specific rules it lost to before.
 */
const THEME_EDITS_LAYER = "features";

/** At-rules a rule can be nested in. The others (`@keyframes`, `@font-face`...) are compared and saved whole. */
const CONDITIONAL_AT_RULES = new Set([
	"media",
	"supports",
	"container",
	"layer",
	"scope",
	"starting-style",
]);

/**
 * The CSS module source of an overlay stylesheet as theme CSS: its classes named `.{stylesheet}-{class}` (e.g.
 * `.GameScene-infoCard`), which the overlay resolves to the module's classes, and `:global()` unwrapped.
 */
export function fromModuleSource({
	source,
	stylesheet,
}: {
	source: string;
	stylesheet: string;
}) {
	const root = parse(source);

	root.walkRules((rule) => {
		if (isInKeyframes(rule)) return;

		rule.selector = rule.selector.replace(
			/:global\(([^)]*)\)|\.(-?[_a-zA-Z][\w-]*)/g,
			(_match, global: string | undefined, className: string | undefined) =>
				global ?? `.${stylesheet}-${className}`,
		);
	});
	root.walkAtRules((atRule) => {
		atRule.params = atRule.params.replace(/:global\(([^)]*)\)/g, "$1");
	});

	return root.toString();
}

/** Where CSS fails to parse and why. */
export interface CssError {
	line: number;
	reason: string;
}

/** Why the CSS doesn't parse, `null` when it does. */
export function syntaxError(css: string): CssError | null {
	try {
		parse(css);
		return null;
	} catch (error) {
		if (!(error instanceof CssSyntaxError)) throw error;

		return { line: error.line ?? 1, reason: error.reason };
	}
}

/** A custom property declared in CSS, `start` and `end` being where its value is in the text. */
export interface CustomPropertyDeclaration {
	name: string;
	value: string;
	start: number;
	end: number;
}

/** The custom properties declared in the CSS in order, read off the text so also of CSS that doesn't parse. */
export function customPropertyDeclarations(
	css: string,
): CustomPropertyDeclaration[] {
	return Array.from(
		withoutComments(css).matchAll(/(?<![\w-])(--[\w-]+)\s*:\s*([^;{}]*)/g),
		(match) => {
			const value = match[2].trimEnd();
			const start = match.index + match[0].length - match[2].length;

			return {
				name: match[1],
				value: css.slice(start, start + value.length),
				start,
				end: start + value.length,
			};
		},
	);
}

/** A `var()` in CSS, `start` and `end` being where the whole `var(...)` is in the text. */
export interface VariableReference {
	name: string;
	start: number;
	end: number;
}

/** The `var()`s of the text in order, a fallback included in its `var()`. */
export function variableReferences(text: string): VariableReference[] {
	const references: VariableReference[] = [];

	for (const match of withoutComments(text).matchAll(/var\(\s*(--[\w-]+)/g)) {
		let depth = 0;
		let end = match.index;
		for (; end < text.length; end++) {
			if (text[end] === "(") depth++;
			if (text[end] === ")" && --depth === 0) break;
		}

		references.push({ name: match[1], start: match.index, end: end + 1 });
	}

	return references;
}

/**
 * The rules of `edited` that differ from `base`: changed and added declarations, `unset` for the removed ones and
 * whole at-rules like `@keyframes` that changed. Nested rules stay nested in their parents. Empty when nothing
 * changed. Throws a `CssSyntaxError` when `edited` doesn't parse.
 */
export function diff(base: string, edited: string) {
	const baseEntries = indexed(flatten(parse(base)));
	const editedEntries = indexed(flatten(parse(edited)));
	const changes: Change[] = [];

	for (const entry of editedEntries.values()) {
		const original = baseEntries.get(entry.key);

		if (entry.type === "atomic") {
			if (original?.type !== "atomic" || original.text !== entry.text) {
				changes.push({ path: entry.path.slice(0, -1), node: entry.node });
			}
			continue;
		}

		const declarations = changedDeclarations(
			original?.type === "rule" ? original.declarations : new Map(),
			entry.declarations,
		);
		if (declarations.length > 0) {
			changes.push({ path: entry.path, declarations });
		}
	}

	for (const original of baseEntries.values()) {
		if (editedEntries.has(original.key)) continue;

		if (original.type === "atomic") {
			if (isKeyframes(original.node)) {
				const emptied = original.node.clone();
				emptied.removeAll();
				changes.push({ path: original.path.slice(0, -1), node: emptied });
			}
			continue;
		}

		changes.push({
			path: original.path,
			declarations: [...original.declarations.keys()].map((property) => ({
				property,
				value: "unset",
			})),
		});
	}

	return format(changes);
}

/**
 * The CSS saved for the overlays: the edits of each stylesheet (see {@link diff}) in {@link THEME_EDITS_LAYER},
 * then the custom CSS as is, unlayered.
 */
export function compose({
	edits,
	custom,
}: {
	edits: string[];
	custom: string;
}) {
	const allEdits = edits.filter(Boolean).join("\n\n");
	const editsBlock = allEdits
		? `@layer ${THEME_EDITS_LAYER} {\n${indent(allEdits)}\n}`
		: "";

	return [editsBlock, custom.trim()].filter(Boolean).join("\n\n");
}

/**
 * Splits saved CSS (see {@link compose}) back to the stylesheets it edits: each stylesheet with its edits applied,
 * and what is left as the custom CSS (anything outside the edits layer, or edits of rules no stylesheet has anymore).
 * Unparseable CSS is left whole as the custom CSS.
 */
export function merge<Name extends string>({
	bases,
	css,
}: {
	bases: Record<Name, string>;
	css: string;
}): { stylesheets: Record<Name, string>; custom: string } {
	const unchanged = { stylesheets: bases, custom: css };

	let saved: ReturnType<typeof parse>;
	try {
		saved = parse(css);
	} catch {
		return unchanged;
	}

	const editBlocks = (saved.nodes ?? []).filter(
		(node): node is AtRule =>
			node.type === "atrule" &&
			node.name === "layer" &&
			node.params.trim() === THEME_EDITS_LAYER &&
			Boolean(node.nodes),
	);
	if (editBlocks.length === 0) return unchanged;

	const roots = Object.fromEntries(
		Object.entries<string>(bases).map(([name, base]) => [name, parse(base)]),
	) as Record<Name, ReturnType<typeof parse>>;
	const targets = new Map<string, Entry[]>();
	for (const root of Object.values<ReturnType<typeof parse>>(roots)) {
		for (const entry of flatten(root)) {
			targets.set(entry.key, [...(targets.get(entry.key) ?? []), entry]);
		}
	}

	for (const block of editBlocks) {
		for (const entry of flatten(block)) {
			const matching = targets.get(entry.key);
			if (!matching) continue;

			if (entry.type === "atomic") {
				matching.at(-1)!.node.replaceWith(entry.node.clone());
				entry.node.remove();
				continue;
			}

			for (const [property, values] of entry.declarations) {
				applyDeclarations({
					targets: matching.map((target) => target.node),
					property,
					values,
				});
			}
			for (const declaration of ownDeclarations(entry.node)) {
				declaration.remove();
			}
		}

		removeEmpty(block);
		if (block.first?.raws.before) {
			block.first.raws.before = block.first.raws.before.replace(/^\n+/, "\n");
		}
	}

	return {
		stylesheets: Object.fromEntries(
			Object.entries<ReturnType<typeof parse>>(roots).map(([name, root]) => [
				name,
				root.toString(),
			]),
		) as Record<Name, string>,
		custom: saved.toString().trim(),
	};
}

interface DeclarationValue {
	/** As written, `!important` included. */
	value: string;
	/** Whitespace collapsed, what is compared. */
	normalized: string;
}

interface RuleEntry {
	type: "rule";
	/** Selectors and at-rules it is in, outermost first, its own last. */
	path: string[];
	key: string;
	/** Its own declarations by property, a property's values in order. */
	declarations: Map<string, DeclarationValue[]>;
	node: Container;
}

interface AtomicEntry {
	type: "atomic";
	path: string[];
	key: string;
	text: string;
	node: AtRule;
}

type Entry = RuleEntry | AtomicEntry;

type Change =
	| {
			path: string[];
			declarations: Array<{ property: string; value: string }>;
	  }
	| { path: string[]; node: AtRule };

function flatten(container: Container, path: string[] = []): Entry[] {
	const entries: Entry[] = [];
	const declarations = new Map<string, DeclarationValue[]>();

	for (const node of container.nodes ?? []) {
		switch (node.type) {
			case "decl": {
				const property = propertyOf(node);
				declarations.set(property, [
					...(declarations.get(property) ?? []),
					declarationValue(node),
				]);
				break;
			}
			case "rule": {
				entries.push(...flatten(node, [...path, node.selector.trim()]));
				break;
			}
			case "atrule": {
				const atRulePath = [...path, prelude(node)];
				if (CONDITIONAL_AT_RULES.has(node.name) && node.nodes) {
					entries.push(...flatten(node, atRulePath));
				} else {
					entries.push({
						type: "atomic",
						path: atRulePath,
						key: keyOf(atRulePath),
						text: normalizeWhitespace(formatNode(node, 0)),
						node,
					});
				}
				break;
			}
		}
	}

	if (declarations.size > 0 && path.length > 0) {
		entries.unshift({
			type: "rule",
			path,
			key: keyOf(path),
			declarations,
			node: container,
		});
	}

	return entries;
}

/** By key, a rule written more than once merged into one, its later declarations winning. */
function indexed(entries: Entry[]) {
	const result = new Map<string, Entry>();

	for (const entry of entries) {
		const existing = result.get(entry.key);
		if (existing?.type === "rule" && entry.type === "rule") {
			result.set(entry.key, {
				...existing,
				declarations: new Map([
					...existing.declarations,
					...entry.declarations,
				]),
			});
		} else {
			result.set(entry.key, entry);
		}
	}

	return result;
}

function changedDeclarations(
	base: Map<string, DeclarationValue[]>,
	edited: Map<string, DeclarationValue[]>,
) {
	const changed: Array<{ property: string; value: string }> = [];
	const normalizedOf = (values: DeclarationValue[] | undefined) =>
		values?.map((value) => value.normalized).join("\n");

	for (const [property, values] of edited) {
		if (normalizedOf(base.get(property)) === normalizedOf(values)) continue;

		for (const { value } of values) {
			changed.push({ property, value });
		}
	}
	for (const property of base.keys()) {
		if (!edited.has(property)) changed.push({ property, value: "unset" });
	}

	return changed;
}

/**
 * Sets the property in the last of the rules having it (or else the last of them), `unset` removes it from all of
 * them instead.
 */
function applyDeclarations({
	targets,
	property,
	values,
}: {
	targets: Container[];
	property: string;
	values: DeclarationValue[];
}) {
	if (values.length === 1 && values[0].normalized === "unset") {
		for (const target of targets) {
			for (const declaration of ownDeclarations(target, property)) {
				declaration.remove();
			}
		}
		return;
	}

	const target =
		targets.findLast(
			(candidate) => ownDeclarations(candidate, property).length > 0,
		) ?? targets.at(-1)!;
	const existing = ownDeclarations(target, property);
	const before =
		existing[0] ??
		(target.nodes ?? []).find(
			(node) => node.type !== "decl" && node.type !== "comment",
		);

	for (const { value } of values) {
		const important = /\s*!important$/i;
		const declaration = {
			prop: property,
			value: value.replace(important, ""),
			important: important.test(value),
		};
		if (before) {
			target.insertBefore(before, declaration);
		} else {
			target.append(declaration);
		}
	}
	for (const declaration of existing) {
		declaration.remove();
	}
}

function ownDeclarations(container: Container, property?: string) {
	return (container.nodes ?? []).filter(
		(node): node is Declaration =>
			node.type === "decl" &&
			(property === undefined || propertyOf(node) === property),
	);
}

function removeEmpty(container: Container) {
	for (const node of [...(container.nodes ?? [])]) {
		if (node.type === "rule" || (node.type === "atrule" && node.nodes)) {
			removeEmpty(node);
		}
	}

	for (const node of [...(container.nodes ?? [])]) {
		if (
			(node.type === "rule" || (node.type === "atrule" && node.nodes)) &&
			!(node as Container).nodes?.some((child) => child.type !== "comment")
		) {
			node.remove();
		}
	}

	if (
		container.type !== "root" &&
		!container.nodes?.some((child) => child.type !== "comment")
	) {
		container.remove();
	}
}

interface OutputBlock {
	prelude: string;
	lines: string[];
	children: Array<OutputBlock | string>;
}

function format(changes: Change[]) {
	const root: OutputBlock = { prelude: "", lines: [], children: [] };

	for (const change of changes) {
		let block = root;
		for (const blockPrelude of change.path) {
			const last = block.children.at(-1);
			if (typeof last === "object" && last.prelude === blockPrelude) {
				block = last;
			} else {
				const child: OutputBlock = {
					prelude: blockPrelude,
					lines: [],
					children: [],
				};
				block.children.push(child);
				block = child;
			}
		}

		if ("node" in change) {
			block.children.push(formatNode(change.node, 0));
		} else {
			block.lines.push(
				...change.declarations.map(
					(declaration) => `${declaration.property}: ${declaration.value};`,
				),
			);
		}
	}

	return root.children.map((child) => formatBlock(child)).join("\n\n");
}

function formatBlock(block: OutputBlock | string): string {
	if (typeof block === "string") return block;

	const body = [...block.lines, ...block.children.map(formatBlock)].join("\n");

	return `${block.prelude} {\n${indent(body)}\n}`;
}

function formatNode(node: ChildNode, depth: number): string {
	const indentation = "\t".repeat(depth);

	switch (node.type) {
		case "decl":
			return `${indentation}${node.prop}: ${node.value}${node.important ? " !important" : ""};`;
		case "rule":
			return formatContainer(node.selector.trim(), node, depth);
		case "atrule":
			return node.nodes
				? formatContainer(prelude(node), node, depth)
				: `${indentation}${prelude(node)};`;
		default:
			return "";
	}
}

function formatContainer(
	containerPrelude: string,
	container: Rule | AtRule,
	depth: number,
) {
	const indentation = "\t".repeat(depth);
	const body = (container.nodes ?? [])
		.map((child) => formatNode(child, depth + 1))
		.filter(Boolean);
	if (body.length === 0) return `${indentation}${containerPrelude} {}`;

	return `${indentation}${containerPrelude} {\n${body.join("\n")}\n${indentation}}`;
}

function declarationValue(declaration: Declaration): DeclarationValue {
	const value = `${declaration.value.trim()}${declaration.important ? " !important" : ""}`;

	return { value, normalized: normalizeWhitespace(value) };
}

function propertyOf(declaration: Declaration) {
	return declaration.prop.startsWith("--")
		? declaration.prop
		: declaration.prop.toLowerCase();
}

function prelude(atRule: AtRule) {
	return `@${atRule.name}${atRule.params ? ` ${atRule.params.trim()}` : ""}`;
}

function keyOf(path: string[]) {
	return path
		.map((part) => normalizeWhitespace(part).replace(/\s*([>+~,])\s*/g, "$1"))
		.join(" › ");
}

/** Comments blanked out, keeping every other character where it was. */
function withoutComments(css: string) {
	return css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
		comment.replace(/[^\n]/g, " "),
	);
}

function normalizeWhitespace(text: string) {
	return text.replace(/\s+/g, " ").trim();
}

function indent(text: string) {
	return text
		.split("\n")
		.map((line) => (line ? `\t${line}` : line))
		.join("\n");
}

function isKeyframes(atRule: AtRule) {
	return /^(-\w+-)?keyframes$/i.test(atRule.name);
}

function isInKeyframes(rule: Rule) {
	return rule.parent?.type === "atrule" && isKeyframes(rule.parent as AtRule);
}
