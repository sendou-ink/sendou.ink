import fs from "node:fs";
import path from "node:path";
import { lineOf, parseFile, ROOT } from "./ast.ts";

const PACKAGE_FILE = "package.json";
/** A repo script a command runs, e.g. `vite-node -c scripts/scanner/vite-node.config.ts scripts/scanner/report.ts`. */
const SCRIPT_FILE_REGEX =
	/\b(?:node|vite-node)\s+(?:-c\s+\S+\s+)?(?:\.\/)?((?:scripts|e2e|app)\/\S+\.ts)\b/;
const ENV_ASSIGNMENT_REGEX = /(?:^|\s)([A-Z][A-Z0-9_]*)=("[^"]*"|\S*)/g;
const CHAINED_SCRIPT_REGEX = /\bpnpm\s+(?:run\s+)?([a-z][\w:-]*)/g;
const MAX_DESCRIPTION_LENGTH = 160;
const MIN_SHORTENED_LENGTH = 25;
/** pnpm's own commands, not package scripts. */
const PNPM_COMMANDS = new Set(["install", "exec", "dlx", "add"]);

/** For scripts that run a tool rather than a repo script, or whose script has no comment at its top saying what the package script does. Wins over the comment. */
const DESCRIPTIONS: Record<string, string> = {
	deploy: "Render's build command: installs the locked dependencies and builds",
	build:
		"Production build of the app, after regenerating the translation usage index",
	dev: "Dev server against db.sqlite3, migrating and setting up the dev database first",
	"dev:fast": "Dev server without the migrate and setup steps of `dev`",
	"dev:docs":
		"The docs site (living docs included) at http://localhost:4321, see docs/site/src/content/docs/dev/living-docs.mdx",
	"dev:sandbox":
		"Dev server against db-sandbox.sqlite3, the local copy of production data",
	start: "Production server: migrates the database then serves the build",
	migrate:
		"Runs the Kysely migrations of /migrations, e.g. `pnpm run migrate up`",
	"migrate:new":
		'Scaffolds a new migration file, e.g. `pnpm run migrate:new "add user bio"`',
	"migrate:sandbox": "Migrates db-sandbox.sqlite3",
	"check-translation-jsons":
		"Checks the translation jsons for missing keys and plural suffix clashes, fixing what it can",
	"check-translation-jsons:no-write":
		"`check-translation-jsons` without writing fixes, for CI",
	"bench:db":
		"Benchmarks the repository read functions against db-sandbox.sqlite3",
	"compute-luti-divs": "Runs the ComputeLutiDivs routine once",
	"download-prod-db":
		"Snapshots the production database over SSH into db-snapshot.sqlite3 and rebuilds the sandbox, see docs/site/src/content/docs/dev/scripts.mdx",
	"deploy:prod":
		"Deploys to Render with maintenance mode on until the new instance is healthy, see docs/site/src/content/docs/dev/scripts.mdx",
	"sandbox:reset":
		"Restores db-sandbox.sqlite3 from db-snapshot.sqlite3 and migrates it",
	"biome:check": "Biome lint and format check",
	"biome:fix": "Biome lint and format, applying the safe fixes",
	"biome:fix:unsafe": "Biome lint and format, applying the unsafe fixes too",
	typecheck: "Type checks the app after generating the route types",
	"typecheck:scripts": "Type checks scripts/",
	"typecheck:docs": "Type checks the docs site",
	"test:unit:browser": "Runs the unit and browser (Vitest browser mode) tests",
	"test:browser:ui": "Browser tests in Vitest's UI",
	"test:unit:browser:ui": "Unit and browser tests in Vitest's UI",
	"test:scanner": "Runs the scanner's fixture tests",
	"test:e2e": "Runs the Playwright e2e tests",
	"test:e2e:flaky-detect":
		"Runs every e2e test 10 times, stopping at the first failure",
	"check-plural-collapse":
		"Fails when a translation json has suffixed plural keys `i18n:sync` would collapse",
	"check-translation-sync":
		"Fails when the translation jsons are out of sync with English",
	checks:
		"Everything CI checks: lint, unit and browser tests, translations, type checks and knip. A task isn't done until it passes",
	"checks:scanner": "`checks` plus the scanner tests",
	seed: "Rebuilds the dev dataset of db.sqlite3",
	setup:
		"Seeds the dev database and its images when they are missing, run by `dev`",
	"docs:build":
		"Builds the docs site into docs/site/dist and checks its internal links",
	"docs:preview": "Builds the docs site and serves the build, search included",
	"docs:screenshots:publish":
		"Uploads the screenshots of a `docs:capture` run to the docs' Space, run by CI on pushes to main",
	"docs:screenshots:download":
		"Downloads the published screenshots whose spec is unchanged since their capture, run by the docs site's Render build",
	"notification:test":
		"Sends a test notification (and web push) to a user of the dev database",
	"i18n:sync":
		"Syncs the translation jsons with English, run after removing or renaming keys",
	knip: "Finds unused files, exports and dependencies",
};

/** Name prefix → group heading, the first matching one wins. */
const GROUPS: Array<{ label: string; matches: (name: string) => boolean }> = [
	{
		label: "Develop",
		matches: (name) => /^(dev|seed|setup)\b/.test(name),
	},
	{
		label: "Build & deploy",
		matches: (name) => /^(build|deploy|start)\b/.test(name),
	},
	{
		label: "Database",
		matches: (name) => /^(migrate|sandbox|download-prod-db|bench)\b/.test(name),
	},
	{
		label: "Checks",
		matches: (name) => /^(checks|biome|typecheck|knip)\b/.test(name),
	},
	{ label: "Tests", matches: (name) => name.startsWith("test:") },
	{
		label: "Translations",
		matches: (name) => /^(i18n|check-translation|check-plural)/.test(name),
	},
	{ label: "Docs", matches: (name) => name.startsWith("docs:") },
	{ label: "Scanner", matches: (name) => name.startsWith("scanner:") },
	{ label: "Other", matches: () => true },
];

export interface PackageScript {
	name: string;
	command: string;
	group: string;
	/** Its entry of `DESCRIPTIONS`, else the comment at the top of the repo script it runs. Null when it has neither. */
	description: string | null;
	/** The repo script it runs, null for one running a tool. */
	file: string | null;
	line: number;
	/** Variables set for it, e.g. by `cross-env DB_PATH=db.sqlite3`. */
	env: Array<{ name: string; value: string }>;
	/** Other package scripts it runs. */
	runs: string[];
}

/** Every script of `package.json` with what it runs and a one-line description. */
export function documentPackageScripts(): PackageScript[] {
	const source = fs.readFileSync(path.join(ROOT, PACKAGE_FILE), "utf8");
	const scripts = JSON.parse(source).scripts as Record<string, string>;
	const names = new Set(Object.keys(scripts));
	const lines = source.split("\n");

	return Object.entries(scripts).map(([name, command]) => {
		const file = command.match(SCRIPT_FILE_REGEX)?.[1] ?? null;
		const existingFile =
			file && fs.existsSync(path.join(ROOT, file)) ? file : null;

		return {
			name,
			command,
			group: GROUPS.find((group) => group.matches(name))!.label,
			description:
				DESCRIPTIONS[name] ??
				(existingFile ? leadingComment(existingFile) : null),
			file: existingFile,
			line:
				lines.findIndex((line) => line.trimStart().startsWith(`"${name}":`)) +
				1,
			env: [...command.matchAll(ENV_ASSIGNMENT_REGEX)].map(
				([, envName, value]) => ({
					name: envName,
					value: value.replace(/^"(.*)"$/, "$1"),
				}),
			),
			runs: [
				...new Set(
					[...command.matchAll(CHAINED_SCRIPT_REGEX)]
						.map(([, script]) => script)
						.filter(
							(script) =>
								!PNPM_COMMANDS.has(script) &&
								script !== name &&
								names.has(script),
						),
				),
			],
		};
	});
}

/** The first sentence of the comment at the top of a script, before its first statement past the imports. */
function leadingComment(file: string) {
	const parsed = parseFile(file);
	const firstStatement = parsed.program.body.find(
		(statement) => statement.type !== "ImportDeclaration",
	);
	const comments = parsed.comments.filter(
		(comment) =>
			!comment.value.replace(/^\*/, "").trim().startsWith("biome-ignore") &&
			(!firstStatement || comment.end <= firstStatement.start),
	);
	const first = comments[0];
	if (!first) return null;

	const block = [first];
	if (first.type === "Line") {
		for (const comment of comments.slice(1)) {
			const previous = block.at(-1)!;
			const isNextLine =
				comment.type === "Line" &&
				lineOf(parsed, comment.start) === lineOf(parsed, previous.end) + 1;
			if (!isNextLine) break;
			block.push(comment);
		}
	}

	const attachedToStatement =
		firstStatement &&
		parsed.source.slice(block.at(-1)!.end, firstStatement.start).trim() ===
			"" &&
		!parsed.source
			.slice(block.at(-1)!.end, firstStatement.start)
			.includes("\n\n");
	if (attachedToStatement) return null;

	const lines = block.flatMap((comment) =>
		comment.value
			.replace(/^\*/, "")
			.split("\n")
			.map((line) => line.replace(/^\s*\* ?/, "").trim()),
	);
	const blankIndex = lines.findIndex(
		(line, index) => index > 0 && line === "" && lines[index - 1] !== "",
	);
	const firstParagraph = (
		blankIndex === -1 ? lines : lines.slice(0, blankIndex)
	)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
	const firstSentence =
		firstParagraph.match(/^.+?\.(?=\s|$)/)?.[0] ?? firstParagraph;

	return capitalize(shorten(firstSentence.replace(/[.:]$/, "")));
}

/** Cuts a long sentence at its first `: ` or ` — ` that leaves enough to say what the script does. */
function shorten(sentence: string) {
	if (sentence.length <= MAX_DESCRIPTION_LENGTH) return sentence;

	const cut = [...sentence.matchAll(/: | — /g)].find(
		(match) => match.index >= MIN_SHORTENED_LENGTH,
	);
	return cut ? sentence.slice(0, cut.index) : sentence;
}

function capitalize(text: string) {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
