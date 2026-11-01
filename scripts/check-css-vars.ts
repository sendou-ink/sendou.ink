/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// checks that every custom property read with `var(--x)` and no fallback is defined somewhere: a
// `--x:` declaration in a stylesheet or a "--x" string literal in code (inline styles, setProperty),
// run by `pnpm run checks`. The browser silently drops a declaration reading an undefined var

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = path.join(import.meta.dirname, "..");
/** Set at runtime with names built from template literals, so they never appear as a literal. */
const RUNTIME_DEFINED: string[] = [];

const NAME = String.raw`--[\w-]+`;
const CSS_DECLARATION_REGEX = new RegExp(
	String.raw`(?<![\w-])(${NAME})\s*:`,
	"g",
);
const CSS_PROPERTY_RULE_REGEX = new RegExp(
	String.raw`@property\s+(${NAME})`,
	"g",
);
const STRING_LITERAL_NAME_REGEX = new RegExp(
	String.raw`(["'\`])(${NAME})\1`,
	"g",
);
const READ_WITHOUT_FALLBACK_REGEX = new RegExp(
	String.raw`var\(\s*(${NAME})\s*\)`,
	"g",
);
const CSS_COMMENT_REGEX = /\/\*[\s\S]*?\*\//g;
const CODE_COMMENT_REGEX =
	/("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

const defined = new Set(RUNTIME_DEFINED);
const reads: Array<{ name: string; location: string }> = [];

for (const file of trackedFiles()) {
	const isCss = file.endsWith(".css");
	const source = withoutComments(
		fs.readFileSync(path.join(ROOT_DIR, file), "utf8"),
		isCss,
	);

	const definitionRegexes = isCss
		? [CSS_DECLARATION_REGEX, CSS_PROPERTY_RULE_REGEX]
		: [STRING_LITERAL_NAME_REGEX];
	for (const regex of definitionRegexes) {
		for (const match of source.matchAll(regex)) {
			defined.add(match.at(-1)!);
		}
	}

	for (const match of source.matchAll(READ_WITHOUT_FALLBACK_REGEX)) {
		reads.push({
			name: match[1],
			location: `${file}:${lineOf(source, match.index)}`,
		});
	}
}

const undefinedReads = reads.filter((read) => !defined.has(read.name));
if (undefinedReads.length > 0) {
	console.error(
		`${undefinedReads.length} reads of undefined CSS custom properties (no fallback, so the declaration is dropped):\n${undefinedReads
			.map((read) => `${read.location} ${read.name}`)
			.join("\n")}`,
	);
	process.exit(1);
}
console.log(`css vars ok (${defined.size} defined, ${reads.length} reads)`);

function trackedFiles() {
	return execFileSync(
		"git",
		["ls-files", "app/*.css", "app/*.ts", "app/*.tsx"],
		{ cwd: ROOT_DIR, encoding: "utf8" },
	)
		.split("\n")
		.filter(Boolean);
}

/** Blanks out comments, keeping newlines so line numbers still match the file. */
function withoutComments(source: string, isCss: boolean) {
	const blank = (comment: string) => comment.replace(/[^\n]/g, " ");

	if (isCss) return source.replace(CSS_COMMENT_REGEX, blank);

	return source.replace(CODE_COMMENT_REGEX, (match, stringLiteral) =>
		stringLiteral ? match : blank(match),
	);
}

function lineOf(source: string, index: number) {
	return source.slice(0, index).split("\n").length;
}
