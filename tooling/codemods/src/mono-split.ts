/**
 * mono-split — rewrites module specifiers in `apps/web-react` from in-app paths
 * to the extracted workspace packages. Idempotent: specifiers are rewritten by
 * exact prefix/pattern match, so re-running is a no-op once the sources no
 * longer contain the old specifiers.
 *
 * The file moves themselves (git mv into `packages/*`) are one-time operations
 * recorded in git history; this script owns only the import rewriting so it can
 * be re-run if new code lands still using the old specifiers.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const APP_ROOT = new URL("../../../apps/web-react", import.meta.url).pathname;

const SPECIFIER_PREFIX_MAP: ReadonlyArray<[from: string, to: string]> = [
	["~/modules/in-game-lists", "@sendou/in-game-lists"],
	["~/features/tournament-bracket/core/engine", "@sendou/tournament-engine"],
];

/**
 * Relative specifiers that reach into a moved directory. `dirPrefix` limits
 * the pattern to files under that directory (relative to the app root) so a
 * `./engine` elsewhere can never be rewritten by accident.
 */
const RELATIVE_SPECIFIER_RULES: ReadonlyArray<{
	dirPrefix: string;
	pattern: RegExp;
	packageName: string;
}> = [
	{
		dirPrefix: "",
		pattern: /(?:\.\.\/)+(?:app\/)?modules\/in-game-lists(?=\/)/,
		packageName: "@sendou/in-game-lists",
	},
	{
		dirPrefix: "app/features/tournament-bracket",
		pattern: /(?:\.\.\/|\.\/)+(?:core\/)?engine(?=[/"'])/,
		packageName: "@sendou/tournament-engine",
	},
];

const SOURCE_DIRS = ["app", "e2e", "scripts"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function main() {
	let changedFiles = 0;
	for (const dir of SOURCE_DIRS) {
		for (const filePath of walk(join(APP_ROOT, dir))) {
			if (rewriteFile(filePath)) changedFiles++;
		}
	}
	process.stdout.write(`mono-split: rewrote ${changedFiles} files\n`);
}

function rewriteFile(filePath: string): boolean {
	const original = readFileSync(filePath, "utf8");
	let content = original;
	for (const [from, to] of SPECIFIER_PREFIX_MAP) {
		for (const quote of ['"', "'"]) {
			content = content.replaceAll(`${quote}${from}`, `${quote}${to}`);
		}
	}
	const appRelativePath = relative(APP_ROOT, filePath);
	for (const rule of RELATIVE_SPECIFIER_RULES) {
		if (!appRelativePath.startsWith(rule.dirPrefix)) continue;
		content = content.replace(
			new RegExp(`(["'])${rule.pattern.source}`, "g"),
			`$1${rule.packageName}`,
		);
	}
	if (content === original) return false;
	writeFileSync(filePath, content);
	return true;
}

function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir)) {
		const fullPath = join(dir, entry);
		if (statSync(fullPath).isDirectory()) {
			if (entry === "node_modules") continue;
			yield* walk(fullPath);
		} else if (SOURCE_EXTENSIONS.some((ext) => fullPath.endsWith(ext))) {
			yield fullPath;
		}
	}
}

main();
