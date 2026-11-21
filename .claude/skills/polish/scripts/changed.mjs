/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// The pages a branch can have changed the look of, for a sweep of just those: every file changed
// against the base branch (committed or not) is traced to the pages showing it.
//
//   node .claude/skills/polish/scripts/changed.mjs [--base=main] [--max=40]
//
// How a file leads to pages:
//   a CSS module                  the pages earlier sweeps saw one of its classes on (modules.json)
//   a component next to one       the same, through `Component.module.css`
//   a route file                  the manifest's pages of that route
//   anything else in a feature    the manifest's pages of that feature
//   a global stylesheet           every page: sweep the whole site
// Prints the pages and the `sweep.mjs --only=` line for them.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs, ROOT, readOutputJson } from "./lib.mjs";

const { flags } = parseArgs();
const base = String(flags.base ?? "main");
const max = Number(flags.max ?? 40);

const git = (command) =>
	execSync(`git ${command}`, { cwd: ROOT, encoding: "utf8" })
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
const changed = [
	...new Set([
		...git(`diff --name-only ${base}...HEAD`),
		...git("diff --name-only HEAD"),
		...git("ls-files --others --exclude-standard"),
	]),
].filter((file) => file.startsWith("app/"));

const modules = readOutputJson("modules.json");
const manifest = readOutputJson("manifest.json");
const routes = readOutputJson("routes.json");
if (!modules || !manifest || !routes) {
	console.error(
		"modules.json, manifest.json or routes.json is missing: run polish:db, crawl.mjs and one whole sweep first (the sweep records which page shows which CSS module).",
	);
	process.exit(1);
}

/** url -> why */
const pages = new Map();
const untraced = [];
let isGlobal = false;
const add = (urls, reason) => {
	for (const url of urls) if (!pages.has(url)) pages.set(url, reason);
};

for (const file of changed) {
	if (/^app\/styles\/.*\.css$/.test(file)) {
		isGlobal = true;
		continue;
	}
	const moduleFile = file.endsWith(".module.css")
		? file
		: file.replace(/\.tsx?$/, ".module.css");
	if (modules[moduleFile]) {
		add(modules[moduleFile], `shows ${moduleFile}`);
		continue;
	}
	const route = routes.find((candidate) => candidate.file === file);
	if (route) {
		add(
			manifest.pages
				.filter((page) => page.route === route.path)
				.map((page) => page.url),
			`route ${route.path}`,
		);
		continue;
	}
	const feature = file.match(/^app\/features\/([^/]+)\//)?.[1];
	const ofFeature = feature
		? manifest.pages.filter((page) => page.feature === feature)
		: [];
	if (ofFeature.length > 0 && /\.(tsx|css)$/.test(file)) {
		add(
			ofFeature.slice(0, 6).map((page) => page.url),
			`feature ${feature} (${path.basename(file)})`,
		);
		continue;
	}
	if (/\.(tsx|css)$/.test(file)) untraced.push(file);
}

console.log(`${changed.length} files changed under app/ against ${base}.`);
if (isGlobal) {
	console.log(
		"\nA global stylesheet (app/styles/) changed: any page can look different. Sweep the whole site.",
	);
}
if (pages.size === 0) {
	console.log("\nNo page traced to the changes.");
} else {
	const shown = [...pages].slice(0, max);
	console.log(
		`\n${pages.size} pages${pages.size > max ? ` (the first ${max} shown)` : ""}:`,
	);
	for (const [url, reason] of shown) console.log(`  ${url}   (${reason})`);
	console.log(
		`\nnode .claude/skills/polish/scripts/sweep.mjs --run=<name> --only='${shown.map(([url]) => url).join(",")}'`,
	);
}
if (untraced.length > 0) {
	console.log(
		"\nNot traced to a page (a shared component without a CSS module of its own, or one no sweep has seen): look at where these are used.",
	);
	for (const file of untraced) console.log(`  ${file}`);
}
if (!fs.existsSync(path.join(ROOT, "build", "server", "index.js"))) {
	console.log(
		"\nNo build yet: server.mjs builds the branch before serving it.",
	);
}
