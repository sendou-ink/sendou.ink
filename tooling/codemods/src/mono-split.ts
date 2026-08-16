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
	["~/utils/invariant", "@sendou/utils/invariant"],
	["~/utils/result", "@sendou/utils/result"],
	["~/utils/random", "@sendou/utils/random"],
	["~/utils/number", "@sendou/utils/number"],
	["~/utils/types", "@sendou/utils/types"],
	["~/utils/logger", "@sendou/utils/logger"],
	["~/utils/session-id", "@sendou/utils/session-id"],
	["~/features/build-analyzer/core", "@sendou/build-analyzer/core"],
	["~/features/build-analyzer/data", "@sendou/build-analyzer/data"],
	[
		"~/features/build-analyzer/analyzer-types",
		"@sendou/build-analyzer/analyzer-types",
	],
	[
		"~/features/build-analyzer/analyzer-constants",
		"@sendou/build-analyzer/analyzer-constants",
	],
	["~/features/map-list-generator/core", "@sendou/map-list-generator"],
	["~/modules/tournament-map-list-generator", "@sendou/map-list-generator"],
	["~/features/scanner/core", "@sendou/scanner-core"],
	["~/features/scanner/scanner-types", "@sendou/scanner-core/scanner-types"],
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
	{
		dirPrefix: "app/utils",
		pattern:
			/\.\/(?=(?:invariant|result|random|number|types|logger|session-id)["'])/,
		packageName: "@sendou/utils/",
	},
	{
		dirPrefix: "",
		pattern:
			/(?:\.\.\/)+(?:app\/)?utils\/(?=(?:invariant|result|random|number|types|logger|session-id)["'])/,
		packageName: "@sendou/utils/",
	},
	{
		dirPrefix: "",
		pattern:
			/(?:\.\.\/)+(?:app\/)?modules\/tournament-map-list-generator(?=[/"'])/,
		packageName: "@sendou/map-list-generator",
	},
	{
		dirPrefix: "app/features/",
		pattern: /(?:\.\.\/)+map-list-generator\/core(?=[/"'])/,
		packageName: "@sendou/map-list-generator",
	},
	{
		dirPrefix: "app/features/",
		pattern:
			/(?:\.\.\/)+build-analyzer\/(?=(?:core|data)\/|analyzer-types["']|analyzer-constants["'])/,
		packageName: "@sendou/build-analyzer/",
	},
	{
		dirPrefix: "app/features/",
		pattern: /(?:\.\.\/)+scanner\/core(?=[/"'])/,
		packageName: "@sendou/scanner-core",
	},
	{
		dirPrefix: "app/features/",
		pattern: /(?:\.\.\/)+scanner\/scanner-types(?=["'])/,
		packageName: "@sendou/scanner-core/scanner-types",
	},
	{
		dirPrefix: "",
		pattern:
			/(?:\.\.\/)+(?:app\/)?features\/build-analyzer\/(?=(?:core|data)\/|analyzer-types["']|analyzer-constants["'])/,
		packageName: "@sendou/build-analyzer/",
	},
	{
		dirPrefix: "",
		pattern: /(?:\.\.\/)+(?:app\/)?features\/map-list-generator\/core(?=[/"'])/,
		packageName: "@sendou/map-list-generator",
	},
	{
		dirPrefix: "",
		pattern: /(?:\.\.\/)+(?:app\/)?features\/scanner\/core(?=[/"'])/,
		packageName: "@sendou/scanner-core",
	},
	{
		dirPrefix: "",
		pattern: /(?:\.\.\/)+(?:app\/)?features\/scanner\/scanner-types(?=["'])/,
		packageName: "@sendou/scanner-core/scanner-types",
	},
	{
		dirPrefix: "app/features/build-analyzer/",
		pattern:
			/(?:\.\.\/|\.\/)+(?=(?:core|data)\/|analyzer-types["']|analyzer-constants["'])/,
		packageName: "@sendou/build-analyzer/",
	},
	{
		dirPrefix: "app/features/map-list-generator/",
		pattern: /(?:\.\.\/|\.\/)+core(?=[/"'])/,
		packageName: "@sendou/map-list-generator",
	},
	{
		dirPrefix: "app/features/scanner/",
		pattern: /(?:\.\.\/|\.\/)+core(?=[/"'])/,
		packageName: "@sendou/scanner-core",
	},
	{
		dirPrefix: "app/features/scanner/",
		pattern: /(?:\.\.\/|\.\/)+scanner-types(?=["'])/,
		packageName: "@sendou/scanner-core/scanner-types",
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
