/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// What the stylesheets say before any page is opened: patterns in the CSS modules that cause the
// defects the sweep finds one page at a time, and that a rule could keep out for good. A reading
// list for the reviewer looking at consistency and for whoever writes a guardrail, not findings:
// every line is a place to look at, some are fine as they are.
//
//   node .claude/skills/polish/scripts/source.mjs [--check=<name>[,..]] [--limit=15]
import fs from "node:fs";
import path from "node:path";
import { parseArgs, ROOT } from "./lib.mjs";

const CHECKS = [
	{
		name: "hard-coded-color",
		why: "a color written out instead of a token: it does not follow the theme (light, dark, a supporter's own)",
		test: (declaration) =>
			/^(color|background|background-color|border(-\w+)?-color|border(-\w+)?|fill|stroke|outline(-color)?|box-shadow)$/.test(
				declaration.property,
			) &&
			/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(declaration.value) &&
			!declaration.value.includes("var("),
	},
	{
		name: "font-size-off-scale",
		why: "a font size that is not one of the --font-* tokens",
		test: (declaration) =>
			declaration.property === "font-size" &&
			!/var\(--font-|inherit|^1em$|^100%$/.test(declaration.value),
	},
	{
		name: "transition-all",
		why: "`transition: all` animates layout properties too: a size change slides instead of landing, and reads as a shift",
		test: (declaration) =>
			/^transition(-property)?$/.test(declaration.property) &&
			/\ball\b/.test(declaration.value),
	},
	{
		name: "animated-layout",
		why: "a transition on a property that moves its neighbours (width, height, margin, padding, top, left...)",
		test: (declaration) =>
			/^transition(-property)?$/.test(declaration.property) &&
			/\b(width|height|margin|padding|top|left|right|bottom|gap|font-size)\b/.test(
				declaration.value,
			),
	},
	{
		name: "outline-removed",
		why: "`outline: none` takes the focus ring away: fine only where another focus style replaces it",
		test: (declaration, rule) =>
			declaration.property === "outline" &&
			/^(none|0)$/.test(declaration.value) &&
			!/box-shadow|border-color|outline-color/.test(
				rule.body.replace(/outline:\s*(none|0)/, ""),
			),
	},
	{
		name: "nowrap-unguarded",
		why: "`white-space: nowrap` with nothing in the rule to stop a long text: it pushes its box out (the commonest cause of sideways scroll)",
		test: (declaration, rule) =>
			declaration.property === "white-space" &&
			declaration.value === "nowrap" &&
			!/overflow|text-overflow|min-width|max-width/.test(rule.body),
	},
	{
		name: "viewport-height",
		why: "`vh` is the height with the mobile browser's bars hidden: `dvh` or `svh` is what is on screen",
		test: (declaration) => /\d(\.\d+)?vh\b/.test(declaration.value),
	},
	{
		name: "motion-without-reduced",
		why: "a file that animates and never asks `prefers-reduced-motion`",
		fileTest: (css) =>
			/@keyframes|animation(-name)?\s*:/.test(css) &&
			!/prefers-reduced-motion/.test(css),
	},
];

const { flags } = parseArgs();
const wanted = flags.check ? String(flags.check).split(",") : null;
const limit = Number(flags.limit ?? 15);

const files = fs.globSync("app/**/*.css", { cwd: ROOT }).sort();
for (const check of CHECKS) {
	if (wanted && !wanted.includes(check.name)) continue;
	const hits = [];
	for (const file of files) {
		const css = fs.readFileSync(path.join(ROOT, file), "utf8");
		if (check.fileTest) {
			if (check.fileTest(css)) hits.push({ file, line: 1, text: "" });
			continue;
		}
		for (const rule of rulesOf(css)) {
			for (const declaration of rule.declarations) {
				if (check.test(declaration, rule)) {
					hits.push({
						file,
						line: declaration.line,
						text: `${declaration.property}: ${declaration.value}`,
					});
				}
			}
		}
	}
	hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
	console.log(`\n## ${check.name} (${hits.length})\n${check.why}`);
	for (const hit of hits.slice(0, limit)) {
		console.log(`  ${hit.file}:${hit.line}${hit.text ? `  ${hit.text}` : ""}`);
	}
	if (hits.length > limit) {
		console.log(
			`  ... ${hits.length - limit} more (--check=${check.name} --limit=${hits.length})`,
		);
	}
}

/**
 * The innermost rule blocks of a stylesheet with their declarations: `{ body, declarations: [{ property, value, line }] }`.
 * Good enough for a reading list: comments are dropped, nested rules are their own blocks.
 */
function rulesOf(css) {
	const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
		comment.replace(/[^\n]/g, " "),
	);
	const rules = [];
	const stack = [];
	let start = 0;
	for (let index = 0; index < text.length; index++) {
		const char = text[index];
		if (char === "{") {
			stack.push({ bodyStart: index + 1, chunks: [] });
			start = index + 1;
		} else if (char === "}") {
			const rule = stack.pop();
			if (!rule) continue;
			rule.chunks.push({ text: text.slice(start, index), offset: start });
			start = index + 1;
			rules.push(toRule(rule, text));
		} else if (char === ";" && stack.length > 0) {
			stack
				.at(-1)
				.chunks.push({ text: text.slice(start, index), offset: start });
			start = index + 1;
		}
	}
	return rules;
}

function toRule(rule, text) {
	const declarations = [];
	for (const chunk of rule.chunks) {
		const match = chunk.text.match(/^\s*([\w-]+)\s*:\s*([\s\S]+?)\s*$/);
		if (!match || chunk.text.includes("{")) continue;
		declarations.push({
			property: match[1],
			value: match[2].replace(/\s+/g, " "),
			line: text.slice(0, chunk.offset + chunk.text.search(/\S/)).split("\n")
				.length,
		});
	}
	return {
		body: declarations
			.map((declaration) => `${declaration.property}: ${declaration.value}`)
			.join("; "),
		declarations,
	};
}
