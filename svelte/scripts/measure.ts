// Bundle and SSR numbers of the associations feature, React app vs the SvelteKit slice, both as
// production builds against the same database. See ../README.md for what each number means.
//
// Run from the repo root, after building both (the React build with the slice's stand-in shell in
// place of its own, see react-stand-in-shell/plugin.ts):
//   pnpm run i18n:usage && MEASURE_STAND_IN_SHELL=true react-router build --sourcemapClient hidden
//   SVELTE_SLICE_SOURCEMAP=true pnpm --filter @sendou/web-svelte run build
//   node svelte/scripts/measure.ts [--user=274] [--skip-browser] [--skip-interactions] [--interactions-only]
//     [--interaction-runs=7] [--static-only] [--max-load=4.5] [--port=7611] [--ignore-load] [--allow-stale-build]
//     [--full-react-shell]
// --interactions-only prints the interaction section (see measure-interactions.ts) without writing results.json.
// --interaction-scenario=calendarNew.typeName measures one scenario again (e.g. after a busy spell of the machine)
// and replaces its numbers in results.json, listing the rerun under `interactions.reruns`.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import readline from "node:readline";
import { type Browser, chromium } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import {
	CALENDAR_NEW_PAGE,
	interactionMeasurements,
	tournamentBracketPage,
} from "./measure-interactions.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUTPUT_DIR = path.join(ROOT, "svelte/measurements");

const DEFAULT_PORT = 7611;
const SESSION_SECRET = "measure-secret";

const HTTP_WARMUP_REQUESTS = 300;
const HTTP_ROUNDS = 20;
const HTTP_REQUESTS_PER_ROUND = 100;
const RENDER_ITERATIONS = 1000;
const RENDER_WARMUP_ROUNDS = 2;
const RENDER_ROUNDS = 10;
const BROWSER_RUNS = 7;
const CPU_THROTTLE_RATE = 4;
/** The servers, the benches and Chromium load the machine themselves while measuring. */
const OWN_LOAD_ALLOWANCE = 3;

const userId = Number(argValue("user") ?? 274);
/** The React app's; the slice's is the next one. */
const port = Number(argValue("port") ?? DEFAULT_PORT);
const skipBrowser = process.argv.includes("--skip-browser");
const skipInteractions = process.argv.includes("--skip-interactions");
const interactionsOnly = process.argv.includes("--interactions-only");
const interactionRuns = argValue("interaction-runs");
/** `page.scenario`: measures that interaction scenario again and replaces its numbers in results.json. */
const interactionScenario = argValue("interaction-scenario");
const staticOnly = process.argv.includes("--static-only");
/** 1-minute load average above which the machine counts as busy. */
const maxLoad = Number(argValue("max-load") ?? os.availableParallelism() / 4);
const ignoreLoad = process.argv.includes("--ignore-load");
const allowStaleBuild = process.argv.includes("--allow-stale-build");
/** Measures a React build with its real shell, which the slice does not port: its document and browser numbers then compare unlike things. */
const fullReactShell = process.argv.includes("--full-react-shell");

type AppName = "react" | "svelte";

interface App {
	name: AppName;
	origin: string;
	clientDir: string;
}

const APPS: Record<AppName, App> = {
	react: {
		name: "react",
		origin: `http://localhost:${port}`,
		clientDir: path.join(ROOT, "build/client"),
	},
	svelte: {
		name: "svelte",
		origin: `http://localhost:${port + 1}`,
		clientDir: path.join(ROOT, "svelte/.svelte-kit/output/client"),
	},
};

const PAGES = ["/associations", "/associations/new", "/calendar/new"];

/** Servers of the interaction section's revalidations, without the in-process caches that would hide a database write. */
const UNCACHED_ORIGINS: Record<AppName, string> = {
	react: `http://localhost:${port + 2}`,
	svelte: `http://localhost:${port + 3}`,
};

/**
 * The dev seed's "Paddling Pool 14": one double elimination bracket of 12 teams in progress, ~25 match cards with
 * timers, simulated opponents and exits to another bracket. Its revalidations toggle the score of a match in progress.
 */
const BRACKET_TOURNAMENT_ID = 2;
const BRACKET_IDX = 0;
const BRACKET_SCORE_MATCH_ID = 2;

/** Pages of the interaction section, see measure-interactions.ts. */
const interactionPages = () => ({
	calendarNew: CALENDAR_NEW_PAGE,
	tournamentBracket: tournamentBracketPage({
		tournamentId: BRACKET_TOURNAMENT_ID,
		bracketIdx: BRACKET_IDX,
		revalidation: matchScoreRevalidation(BRACKET_SCORE_MATCH_ID),
	}),
});
/** React Router route ids of the interaction pages, whose components are checked for React Compiler bailouts. */
const INTERACTION_ROUTE_IDS = [
	"features/calendar/routes/calendar.new",
	"features/tournament/routes/to.$id",
	"features/tournament-bracket/routes/to.$id.brackets",
];

/** What each build is made from: a build older than any of these measures code that is gone. */
const BUILD_INPUTS: Record<AppName, { output: string; inputs: string[] }> = {
	react: {
		output: "build/server/index.js",
		inputs: [
			"app",
			"vite.config.ts",
			"svelte/scripts/react-stand-in-shell",
		],
	},
	svelte: {
		output: "svelte/build/index.js",
		inputs: ["app", "svelte/src", "svelte/vite.config.ts"],
	},
};
// generated by the builds and the checks themselves
const GENERATED_INPUTS = ["svelte/src/lib/paraglide"];

const CAVEATS = [
	"associationsNew (the /associations/new page) is port scope, not framework: React's SendouForm statically imports every field type (selects, dnd-kit, map pool and weapon pickers, ...), the slice ports only the text input. Compare frameworks on associations.",
	"The React app fetches its translations as JSON and preloads every namespace once idle, the slice compiles its messages into the scripts: browser transfer splits them out as 'translations (fetched json)'.",
	"interactions: the stack as it would ship, not React vs Svelte alone. Each side runs its own form store (the Svelte one ports the React rules and calls the same shared validation), its own field components and its own router. The fields of /calendar/new are hand-rolled on both sides (no React Aria on that page), so markup is the same: compare interactions.pages.*.domNodes.main. typeName (keystrokes into a plain <input>) is the cleanest framework comparison.",
	"interactions: domNodes.document differs mostly by <head>: React Router renders a modulepreload <link> per chunk and the app preloads its translations, ~250 <link>s on /calendar/new against ~30 in the slice; domNodes.main counts the page itself.",
	"interactions: the Svelte /calendar/new ports the calendar event variant only (not the tournament one) and does not submit to the server; the React page's searchable select, image, trophy and SendouQ map pool filter field types are not ported. The scenarios touch none of those.",
	"interactions: soft navigation is started by React Router's own navigate() (what <Link> calls) and by a click on an anchor for SvelteKit, which handles every anchor of the app itself; time to paint includes fetching the destination's data from the local server.",
	"interactions: the Svelte /to/:id/brackets ports the tournament layout and an elimination bracket read only, from the React loaders' own data: not ported are check-in, finalizing, starting brackets, preparing maps, spoiler-free mode, group tabs, round robin and swiss brackets, dragging the bracket to scroll and remembering its scroll position, the nav's overflow menu (every item fits at 1280px), and the popovers of a match's CAST/LIVE/VOD buttons (the dev tournament shows none). domNodes.main is equal on both sides.",
	"interactions: the React brackets page keeps a server-sent events stream open for live updates (useTopicRevalidation), the slice has none: its work while open counts against React.",
	"interactions: revalidation runs against a second pair of servers started with DISABLE_CACHE=true, so a score written to the database shows on the next revalidation; it is timed in the page from React Router's revalidate() / SvelteKit's refreshAll() to the painted frame showing the score, server time included. React Router refetches the root, layout and page loaders in one request; SvelteKit refreshes the page's two remote queries.",
	"interactions: latency is from an interaction's first input event to the end of the next main thread Paint trace event (raster and compositor excluded), per interaction the longest of its events like INP.",
];

const FRAMEWORK_PACKAGES: Record<AppName, string[]> = {
	react: [
		"react",
		"react-dom",
		"scheduler",
		"react-router",
		"i18next",
		"react-i18next",
		"cookie",
		"set-cookie-parser",
	],
	svelte: [
		"svelte",
		"@sveltejs/kit",
		"esm-env",
		"devalue",
		"@inlang/paraglide-js",
	],
};
const ICON_PACKAGES = ["lucide-react", "@lucide/svelte"];

const ORIGINS = {
	framework: "framework runtime (rendering, router, i18n runtime)",
	ui: "UI layer (components, routes, hooks, icons)",
	sharedApp: "shared app code (schemas, urls, search params, game data)",
	sharedLibraries: "shared libraries (valibot, remeda, date-fns, ...)",
	messages: "translation lookup tables",
	// Paraglide's compiled messages carry no source map, so on the Svelte side this is mostly translations
	unmapped: "unmapped (bundler glue; in the slice also the compiled translations)",
};

const BASE64 =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";


try {
	process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
	// .env is optional
}

/** Both servers in production mode against the development database. The dummies replace values production mode rejects. */
const serverEnv = {
	...process.env,
	NODE_ENV: "production",
	DB_PATH: "db.sqlite3",
	SESSION_SECRET,
	LOHI_TOKEN: "measure",
	DISCORD_CLIENT_ID: "measure",
	DISCORD_CLIENT_SECRET: "measure",
	VITE_E2E_TEST_RUN: "",
};

const sessionCookie = `__Host-session=${signedSession({ user: userId })}`;

const servers: ChildProcess[] = [];

const loadAverageAtStart = os.loadavg()[0];
if (!staticOnly && !ignoreLoad && loadAverageAtStart > maxLoad) {
	throw new Error(
		`Load average ${round2(loadAverageAtStart)} is above ${maxLoad}: timings of a busy machine are inflated. Wait for it to calm down, or pass --ignore-load (or --max-load=N).`,
	);
}
const loadSamples = [loadAverageAtStart];
const sampleLoad = () => loadSamples.push(os.loadavg()[0]);

const provenance = buildProvenance();

if (staticOnly) {
	console.log(
		JSON.stringify(
			{ react: reactStaticBundle(), svelte: svelteStaticBundle() },
			null,
			2,
		),
	);
	process.exit(0);
}

for (const app of Object.values(APPS)) await assertPortFree(app);
if (!skipInteractions) {
	for (const app of Object.values(APPS)) {
		await assertPortFree({ ...app, origin: UNCACHED_ORIGINS[app.name] });
	}
}

try {
	servers.push(
		spawn(
			process.execPath,
			["./node_modules/@react-router/serve/bin.cjs", "./build/server/index.js"],
			{ cwd: ROOT, env: { ...serverEnv, PORT: String(port) } },
		),
		spawn(process.execPath, ["./svelte/build/index.js"], {
			cwd: ROOT,
			env: {
				...serverEnv,
				PORT: String(port + 1),
				ORIGIN: APPS.svelte.origin,
				SVELTE_SLICE_BENCH: "true",
			},
		}),
	);
	if (!skipInteractions) {
		servers.push(
			spawn(
				process.execPath,
				["./node_modules/@react-router/serve/bin.cjs", "./build/server/index.js"],
				{
					cwd: ROOT,
					env: { ...serverEnv, PORT: String(port + 2), DISABLE_CACHE: "true" },
				},
			),
			spawn(process.execPath, ["./svelte/build/index.js"], {
				cwd: ROOT,
				env: {
					...serverEnv,
					PORT: String(port + 3),
					ORIGIN: UNCACHED_ORIGINS.svelte,
					DISABLE_CACHE: "true",
				},
			}),
		);
	}
	for (const server of servers) {
		// drained so that a full pipe never blocks a server
		server.stdout?.resume();
		server.stderr?.on("data", (data) => process.stderr.write(data));
	}
	await Promise.all([
		...Object.values(APPS).map((app) => waitForServer(app)),
		...(skipInteractions
			? []
			: Object.values(APPS).map((app) =>
					waitForServer({ ...app, origin: UNCACHED_ORIGINS[app.name] }),
				)),
	]);

	const browser = await chromium.launch();
	let results: Record<string, unknown>;
	try {
		const builds = await checkBuilds(browser);
		if (interactionScenario) {
			rerunInteractionScenario(await runInteractions(browser), interactionScenario);
			await browser.close();
			for (const server of servers) server.kill("SIGKILL");
			process.exit(0);
		}
		if (interactionsOnly) {
			const interactions = await runInteractions(browser);
			console.log(JSON.stringify(interactions, null, 2));
			await browser.close();
			for (const server of servers) server.kill("SIGKILL");
			process.exit(0);
		}
		const staticBundle = {
			react: reactStaticBundle(),
			svelte: svelteStaticBundle(),
		};
		const http = await httpBench();
		sampleLoad();
		const renderOnly = await renderBench();
		sampleLoad();
		const browserResult = skipBrowser
			? null
			: await browserMeasurements(browser);
		sampleLoad();
		const interactions = skipInteractions ? null : await runInteractions(browser);
		sampleLoad();

		const peakLoad = Math.max(...loadSamples);
		results = {
			measuredAt: new Date().toISOString(),
			node: process.version,
			cpu: os.cpus()[0]?.model,
			provenance: { ...provenance, builds },
			// timings of a run on a busy machine are inflated: compare the two apps, not runs with each other
			loadAverage: {
				threshold: maxLoad,
				atStart: round2(loadAverageAtStart),
				peak: round2(peakLoad),
				atEnd: round2(os.loadavg()[0]),
			},
			warnings:
				peakLoad > maxLoad + OWN_LOAD_ALLOWANCE
					? [
							`Load average peaked at ${round2(peakLoad)}, more than the measurement itself explains: something else ran meanwhile.`,
						]
					: [],
			caveats: CAVEATS,
			userId,
			staticBundle,
			http,
			renderOnly,
			browser: browserResult,
			interactions,
		};
	} finally {
		await browser.close();
	}

	fs.mkdirSync(OUTPUT_DIR, { recursive: true });
	fs.writeFileSync(
		path.join(OUTPUT_DIR, "results.json"),
		`${JSON.stringify(results, null, "\t")}\n`,
	);
	console.log(JSON.stringify(results, null, 2));
} finally {
	// SIGKILL: a graceful shutdown waits on the keep-alive sockets this process still holds
	for (const server of servers) server.kill("SIGKILL");
}
process.exit(0);

// ---- static bundle: what each build ships for the route, split by who needs it ----

interface SizedFiles {
	files: number;
	raw: number;
	gzip: number;
	brotli: number;
}

type BundlePart = "framework" | "shell" | "associations" | "associationsNew";

interface PartSizes {
	js: SizedFiles;
	css: SizedFiles;
	/** Minified JS bytes by where the code comes from, read off the source maps. */
	jsByOrigin: Record<string, number>;
	largestModules: Array<{ source: string; bytes: number }>;
}

/**
 * `framework`: the import graph of the client entry, what any page loads before its own code.
 * `shell`: what the root layout adds on top; both apps' stand-in shell, unless measured with --full-react-shell.
 * `associations` / `associationsNew`: everything the page needs except the shell (framework + route, the latter
 * including its parent route), i.e. what the feature would cost under a shell that loads nothing.
 */
function parts(
	app: App,
	closures: Record<BundlePart, Set<string>>,
): Record<BundlePart, PartSizes> {
	const filesOf: Record<BundlePart, Set<string>> = {
		framework: closures.framework,
		shell: closures.shell.difference(closures.framework),
		associations: closures.framework.union(closures.associations),
		associationsNew: closures.framework.union(closures.associationsNew),
	};

	const result = {} as Record<BundlePart, PartSizes>;
	for (const [name, files] of Object.entries(filesOf)) {
		const js = [...files].filter((file) => file.endsWith(".js"));
		result[name as BundlePart] = {
			js: sized(app.clientDir, js),
			css: sized(
				app.clientDir,
				[...files].filter((file) => file.endsWith(".css")),
			),
			...moduleBreakdown(app, js),
		};
	}

	return result;
}

function reactManifest() {
	const assetsDir = path.join(APPS.react.clientDir, "assets");
	const manifestFile = fs
		.readdirSync(assetsDir)
		.find((file) => /^manifest-.*\.js$/.test(file));
	if (!manifestFile) throw new Error("No React Router manifest in the build");

	const source = fs.readFileSync(path.join(assetsDir, manifestFile), "utf8");
	return JSON.parse(
		source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1),
	) as {
		entry: ManifestEntry;
		routes: Record<string, ManifestEntry>;
	};
}

function reactStaticBundle() {
	const manifest = reactManifest();

	const closure = (entry: ManifestEntry) =>
		new Set(
			[entry.module, ...entry.imports, ...(entry.css ?? [])].map((file) =>
				file.replace(/#$/, "").replace(/^\//, ""),
			),
		);

	const associations = closure(
		manifest.routes["features/associations/routes/associations"],
	);

	return parts(APPS.react, {
		framework: closure(manifest.entry),
		shell: closure(manifest.routes.root),
		associations,
		// rendered inside its parent route
		associationsNew: associations.union(
			closure(manifest.routes["features/associations/routes/associations.new"]),
		),
	});
}

interface ManifestEntry {
	module: string;
	imports: string[];
	css?: string[];
}

function svelteStaticBundle() {
	const manifest = JSON.parse(
		fs.readFileSync(
			path.join(APPS.svelte.clientDir, ".vite/manifest.json"),
			"utf8",
		),
	) as Record<
		string,
		{
			file: string;
			imports?: string[];
			dynamicImports?: string[];
			css?: string[];
		}
	>;

	const closure = (keys: string[], { followDynamic = false } = {}) => {
		const files = new Set<string>();
		const visit = (key: string) => {
			const chunk = manifest[key];
			if (!chunk || files.has(chunk.file)) return;
			files.add(chunk.file);
			for (const css of chunk.css ?? []) files.add(css);
			for (const imported of chunk.imports ?? []) visit(imported);
			if (followDynamic) {
				for (const imported of chunk.dynamicImports ?? []) visit(imported);
			}
		};
		for (const key of keys) visit(key);

		return files;
	};

	const keyEndingWith = (suffix: string) => {
		const key = Object.keys(manifest).find((k) => k.endsWith(suffix));
		if (!key) throw new Error(`No "${suffix}" in the SvelteKit client manifest`);
		return key;
	};
	const node = (component: string) => {
		const nodesDir = path.join(
			ROOT,
			"svelte/.svelte-kit/generated/build/client-optimized/nodes",
		);
		const file = fs
			.readdirSync(nodesDir)
			.find((name) =>
				fs.readFileSync(path.join(nodesDir, name), "utf8").includes(component),
			);
		if (!file) throw new Error(`No generated node for ${component}`);
		return keyEndingWith(`client-optimized/nodes/${file}`);
	};

	const associations = closure([
		node("routes/associations/+layout.svelte"),
		node("routes/associations/+page.svelte"),
	]);

	return parts(APPS.svelte, {
		// the entry loads the client runtime through a dynamic import, the app manifest
		// its nodes: only the former is part of the framework
		framework: closure([keyEndingWith("runtime/client/entry.js")], {
			followDynamic: true,
		}).union(closure([keyEndingWith("client-optimized/app.js")])),
		shell: closure([node("routes/+layout.svelte")]),
		associations,
		associationsNew: associations.union(
			closure([node("routes/associations/new/+page.svelte")]),
		),
	});
}

/** Where a module of the bundle comes from. The shared categories are the very same source files in both apps. */
function originOf(app: AppName, source: string) {
	const packageName = source.match(
		/.*node_modules\/((?:@[^/]+\/)?[^/]+)/,
	)?.[1];
	if (packageName) {
		if (FRAMEWORK_PACKAGES[app].includes(packageName)) return ORIGINS.framework;
		if (ICON_PACKAGES.includes(packageName)) return ORIGINS.ui;
		return ORIGINS.sharedLibraries;
	}

	if (app === "svelte") {
		if (/paraglide/.test(source)) {
			return /runtime|registry|server/.test(source)
				? ORIGINS.framework
				: ORIGINS.messages;
		}
		// the `forms` texts SendouForm loads per language
		if (source.startsWith("locales/")) return ORIGINS.messages;
		if (source.includes(".svelte-kit/")) return ORIGINS.framework;
		if (source.startsWith("svelte/")) return ORIGINS.ui;
		if (source.startsWith("app/")) return ORIGINS.sharedApp;
		return ORIGINS.unmapped;
	}

	if (!source.startsWith("app/")) return ORIGINS.unmapped;
	if (source.startsWith("app/modules/i18n/")) return ORIGINS.framework;
	const isUi =
		/\.(tsx|css)$/.test(source) ||
		/(^|\/)(hooks|use[A-Z][^/]*)\.ts$/.test(source) ||
		source.startsWith("app/hooks/") ||
		source === "app/entry.client.tsx";

	return isUi ? ORIGINS.ui : ORIGINS.sharedApp;
}

function moduleBreakdown(app: App, jsFiles: string[]) {
	const bySource = new Map<string, number>();
	for (const file of jsFiles) {
		for (const [source, bytes] of sourceBytes(path.join(app.clientDir, file))) {
			bySource.set(source, (bySource.get(source) ?? 0) + bytes);
		}
	}

	const jsByOrigin: Record<string, number> = {};
	for (const [source, bytes] of bySource) {
		const origin = originOf(app.name, source);
		jsByOrigin[origin] = (jsByOrigin[origin] ?? 0) + bytes;
	}

	return {
		jsByOrigin,
		largestModules: [...bySource]
			.map(([source, bytes]) => ({ source, bytes }))
			.toSorted((a, b) => b.bytes - a.bytes)
			.slice(0, 40),
	};
}

/** Generated bytes of a chunk attributed to its source modules (paths relative to the repo root) via its source map. */
function sourceBytes(jsFile: string): Map<string, number> {
	const result = new Map<string, number>();
	// the React build prepends a V8 compile hint to shared chunks after their source maps were made (see vite.config.ts)
	const code = fs
		.readFileSync(jsFile, "utf8")
		.replace(/^\/\/# allFunctionsCalledOnLoad\n/, "");
	const mapFile = `${jsFile}.map`;
	// the bundler's own helper chunks (e.g. the preload helper) come without one
	if (!fs.existsSync(mapFile)) {
		return result.set("(unmapped)", code.length);
	}
	const map = JSON.parse(fs.readFileSync(mapFile, "utf8")) as {
		sources: string[];
		mappings: string;
	};
	const sources = map.sources.map((source) =>
		source.startsWith("\0") || !/^\.{0,2}\//.test(source)
			? source
			: path.relative(ROOT, path.resolve(path.dirname(jsFile), source)),
	);

	const add = (source: string, bytes: number) => {
		if (bytes > 0) result.set(source, (result.get(source) ?? 0) + bytes);
	};

	const lines = code.split("\n");
	let sourceIndex = 0;
	for (const [lineIndex, line] of map.mappings.split(";").entries()) {
		const lineLength = lines[lineIndex]?.length ?? 0;
		let column = 0;
		let previous: { column: number; source: string | null } | null = null;

		for (const segment of line ? line.split(",") : []) {
			const fields = decodeVlq(segment);
			column += fields[0];
			if (previous) {
				add(previous.source ?? "(unmapped)", column - previous.column);
			} else {
				add("(unmapped)", column);
			}
			if (fields.length > 1) sourceIndex += fields[1];
			previous = {
				column,
				source: fields.length > 1 ? sources[sourceIndex] : null,
			};
		}

		if (previous) {
			add(previous.source ?? "(unmapped)", lineLength - previous.column);
		} else {
			add("(unmapped)", lineLength);
		}
	}

	return result;
}

function decodeVlq(segment: string) {
	const values: number[] = [];
	let value = 0;
	let shift = 0;
	for (const char of segment) {
		const digit = BASE64.indexOf(char);
		value += (digit & 31) << shift;
		if (digit & 32) {
			shift += 5;
		} else {
			values.push(value & 1 ? -(value >> 1) : value >> 1);
			value = 0;
			shift = 0;
		}
	}

	return values;
}

function sized(clientDir: string, files: string[]): SizedFiles {
	const total: SizedFiles = { files: files.length, raw: 0, gzip: 0, brotli: 0 };
	for (const file of files) {
		const sizes = compressedSizes(fs.readFileSync(path.join(clientDir, file)));
		total.raw += sizes.raw;
		total.gzip += sizes.gzip;
		total.brotli += sizes.brotli;
	}

	return total;
}

function compressedSizes(body: Buffer) {
	return {
		raw: body.byteLength,
		gzip: gzipSync(body, { level: 9 }).byteLength,
		brotli: brotliCompressSync(body, {
			params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
		}).byteLength,
	};
}

// ---- HTTP: full requests against the running servers ----

async function httpBench() {
	const svelteQueryPath = await svelteAssociationsQueryPath();
	const targets = {
		// the whole document, as a browser requests it
		reactDocument: `${APPS.react.origin}/associations`,
		svelteDocument: `${APPS.svelte.origin}/associations`,
		// the route's data alone: no rendering, and no shell loaders on the React side
		reactRouteData: `${APPS.react.origin}/associations.data?_routes=${encodeURIComponent("features/associations/routes/associations")}`,
		svelteRouteData: `${APPS.svelte.origin}${svelteQueryPath}`,
	};

	const samples: Record<string, number[]> = {};
	const bytes: Record<string, number> = {};
	for (const [name, url] of Object.entries(targets)) {
		samples[name] = [];
		bytes[name] = (await timedRequests(url, HTTP_WARMUP_REQUESTS)).bytes;
	}

	// short interleaved rounds so that a busy spell of the machine hits every target alike
	const roundMedians: Record<string, number[]> = {};
	for (let round = 0; round < HTTP_ROUNDS; round++) {
		for (const [name, url] of Object.entries(targets)) {
			const { durations } = await timedRequests(url, HTTP_REQUESTS_PER_ROUND);
			samples[name].push(...durations);
			(roundMedians[name] ??= []).push(median(durations));
		}
	}

	return Object.fromEntries(
		Object.entries(samples).map(([name, durations]) => [
			name,
			{
				...stats(durations),
				// the quietest round, closest to what an idle machine gives
				bestRoundP50Ms: round2(Math.min(...roundMedians[name])),
				responseBytes: bytes[name],
			},
		]),
	);
}

/** The remote function endpoint of `getAssociations`, read off the hydration data of the rendered page. */
async function svelteAssociationsQueryPath() {
	const html = await (
		await fetchAsUser(`${APPS.svelte.origin}/associations`)
	).text();
	const id = html.match(/([a-z0-9]+)\/getAssociations/)?.[1];
	if (!id) throw new Error("No getAssociations query in the Svelte document");

	return `/_app/remote/${id}/getAssociations`;
}

async function timedRequests(url: string, count: number) {
	const durations: number[] = [];
	let bytes = 0;
	for (let i = 0; i < count; i++) {
		const startedAt = performance.now();
		const response = await fetchAsUser(url);
		const body = await response.arrayBuffer();
		durations.push(performance.now() - startedAt);
		if (!response.ok) {
			throw new Error(`${url} answered ${response.status}`);
		}
		bytes = body.byteLength;
	}

	return { durations, bytes };
}

function median(values: number[]) {
	return values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
}

function stats(values: number[]) {
	const sorted = values.toSorted((a, b) => a - b);
	const at = (quantile: number) =>
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];

	return {
		samples: sorted.length,
		meanMs: round2(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
		p50Ms: round2(at(0.5)),
		p95Ms: round2(at(0.95)),
	};
}

// ---- render only: the page component rendered in a loop, no HTTP, no queries, no shell ----

/**
 * Each app renders the page in a loop for several rounds, alternating between the apps (and which goes
 * first) so that a busy spell of the machine hits both alike. The best round is the least disturbed one.
 */
async function renderBench() {
	const react = await startReactRenderBench();
	const rounds: Record<AppName, RenderRound[]> = { react: [], svelte: [] };
	try {
		for (let round = 0; round < RENDER_WARMUP_ROUNDS + RENDER_ROUNDS; round++) {
			const order: AppName[] =
				round % 2 === 0 ? ["react", "svelte"] : ["svelte", "react"];
			for (const app of order) {
				const result =
					app === "react" ? await react.round() : await svelteRenderRound();
				if (round >= RENDER_WARMUP_ROUNDS) rounds[app].push(result);
			}
		}
	} finally {
		react.stop();
	}

	const summarize = (results: RenderRound[]) => {
		const microseconds = results.map((result) => result.microsecondsPerRender);
		return {
			iterationsPerRound: RENDER_ITERATIONS,
			rounds: results.length,
			medianMicroseconds: round2(median(microseconds)),
			bestMicroseconds: round2(Math.min(...microseconds)),
			htmlBytes: results[0].htmlBytes,
		};
	};

	return {
		react: summarize(rounds.react),
		svelte: summarize(rounds.svelte),
	};
}

interface RenderRound {
	microsecondsPerRender: number;
	htmlBytes: number;
}

/** react-render-bench.tsx as a long-lived process: renders a round per line it reads. */
async function startReactRenderBench() {
	const bench = spawn(
		"./node_modules/.bin/vite-node",
		[
			"-c",
			"svelte/scripts/react-render-bench.vite.config.ts",
			"--mode",
			"production",
			"svelte/scripts/react-render-bench.tsx",
			String(userId),
			String(RENDER_ITERATIONS),
		],
		{ cwd: ROOT, env: serverEnv, stdio: ["pipe", "pipe", "inherit"] },
	);
	const lines = readline.createInterface({ input: bench.stdout })[
		Symbol.asyncIterator
	]();
	const nextLine = async () => {
		const { value, done } = await lines.next();
		if (done) throw new Error("React render bench exited");
		return value;
	};

	// vite-node may log before the bench is set up
	while ((await nextLine()) !== "ready") {}

	return {
		round: async (): Promise<RenderRound> => {
			bench.stdin.write("round\n");
			return JSON.parse(await nextLine());
		},
		stop: () => bench.kill("SIGKILL"),
	};
}

async function svelteRenderRound(): Promise<RenderRound> {
	const response = await fetchAsUser(
		`${APPS.svelte.origin}/bench/render?n=${RENDER_ITERATIONS}`,
	);
	if (!response.ok) {
		throw new Error(`Svelte render bench answered ${response.status}`);
	}

	return (await response.json()) as RenderRound;
}

// ---- browser: what a cold load transfers and how long the main thread works ----

/** Cold loads alternating between the apps (and which goes first) so that a busy spell of the machine hits both alike. */
async function browserMeasurements(browser: Browser) {
	type ColdLoad = Awaited<ReturnType<typeof coldLoad>>;
	const runs: Record<AppName, Record<string, ColdLoad[]>> = {
		react: {},
		svelte: {},
	};

	for (let run = 0; run < BROWSER_RUNS; run++) {
		for (const pagePath of PAGES) {
			const order: AppName[] =
				run % 2 === 0 ? ["react", "svelte"] : ["svelte", "react"];
			for (const app of order) {
				(runs[app][pagePath] ??= []).push(
					await coldLoad(browser, `${APPS[app].origin}${pagePath}`),
				);
			}
		}
	}

	const summarize = (loads: ColdLoad[]) => {
		const medianOf = (pick: (load: ColdLoad) => number) =>
			round2(median(loads.map(pick)));

		return {
			transfer: loads[0].transfer,
			scriptMs: medianOf((load) => load.scriptMs),
			taskMs: medianOf((load) => load.taskMs),
			domNodes: loads[0].domNodes,
		};
	};

	return Object.fromEntries(
		Object.entries(runs).map(([app, byPage]) => [
			app,
			Object.fromEntries(
				Object.entries(byPage).map(([pagePath, loads]) => [
					pagePath,
					summarize(loads),
				]),
			),
		]),
	);
}

async function coldLoad(browser: Browser, url: string) {
	const context = await browser.newContext({
		extraHTTPHeaders: { cookie: sessionCookie },
		serviceWorkers: "block",
	});
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send("Performance.enable");
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });

	const bodies: Array<Promise<{ type: string; body: Buffer } | null>> = [];
	page.on("response", (response) => {
		const { origin, pathname } = new URL(response.url());
		if (origin !== new URL(url).origin) return;

		const resourceType = response.request().resourceType();
		// the React app fetches its translations as JSON files, the slice compiles them into its scripts
		const type =
			resourceType === "fetch" && pathname.endsWith(".json")
				? "translations (fetched json)"
				: resourceType;
		bodies.push(
			response
				.body()
				.then((body) => ({ type, body }))
				.catch(() => null),
		);
	});

	await page.goto(url, { waitUntil: "networkidle" });

	const { metrics } = await cdp.send("Performance.getMetrics");
	const metric = (name: string) =>
		(metrics.find((entry) => entry.name === name)?.value ?? 0) * 1000;

	const transfer: Record<string, SizedFiles> = {};
	for (const entry of await Promise.all(bodies)) {
		if (!entry) continue;
		const sizes = compressedSizes(entry.body);
		const bucket = (transfer[entry.type] ??= {
			files: 0,
			raw: 0,
			gzip: 0,
			brotli: 0,
		});
		bucket.files++;
		bucket.raw += sizes.raw;
		bucket.gzip += sizes.gzip;
		bucket.brotli += sizes.brotli;
	}

	const domNodes = await page.evaluate(
		() => document.querySelectorAll("*").length,
	);
	await context.close();

	return {
		transfer,
		// CPU time the main thread spent in JavaScript and in tasks overall, CPU throttled
		scriptMs: metric("ScriptDuration"),
		taskMs: metric("TaskDuration"),
		domNodes,
	};
}

// ---- interactions: after load, see measure-interactions.ts ----

async function runInteractions(browser: Browser) {
	return {
		reactCompiler: reactCompilerReport(INTERACTION_ROUTE_IDS),
		...(await interactionMeasurements(
			{
				browser,
				origins: { react: APPS.react.origin, svelte: APPS.svelte.origin },
				uncachedOrigins: UNCACHED_ORIGINS,
				sessionCookie,
				cpuThrottleRate: CPU_THROTTLE_RATE,
				sampleLoad,
				runs: interactionRuns ? Number(interactionRuns) : undefined,
				onlyScenario: interactionScenario,
			},
			interactionPages(),
		)),
	};
}

/**
 * Runs the React Compiler, configured as in vite.config.ts, over every app module the routes' client chunks are
 * made of (read off the build's source maps) and lists the components and hooks it bails out of: those would be
 * measured uncompiled.
 */
function reactCompilerReport(routeIds: string[]) {
	const manifest = reactManifest();
	const files = new Set<string>();
	for (const routeId of routeIds) {
		const route = manifest.routes[routeId];
		if (!route) throw new Error(`No route "${routeId}" in the React manifest`);
		for (const entry of [manifest.entry, manifest.routes.root, route]) {
			for (const file of [entry.module, ...entry.imports]) {
				const chunk = path.join(
					APPS.react.clientDir,
					file.replace(/#$/, "").replace(/^\//, ""),
				);
				for (const source of sourceBytes(chunk).keys()) {
					if (/^app\/.*\.tsx?$/.test(source)) files.add(source);
				}
			}
		}
	}

	const requireFromRoot = createRequire(path.join(ROOT, "package.json"));
	// not a direct dependency: the one the build's babel plugin runs
	const babel = createRequire(
		requireFromRoot.resolve("@babel/preset-typescript"),
	)("@babel/core") as {
		transformSync: (code: string, options: Record<string, unknown>) => unknown;
	};
	const typescriptPreset = requireFromRoot.resolve("@babel/preset-typescript");
	const compilerPlugin = requireFromRoot.resolve("babel-plugin-react-compiler");

	let compiled = 0;
	const bailouts: Array<{ file: string; line?: number; reason: string }> = [];
	for (const file of [...files].toSorted()) {
		babel.transformSync(fs.readFileSync(path.join(ROOT, file), "utf8"), {
			filename: path.join(ROOT, file),
			babelrc: false,
			configFile: false,
			presets: [typescriptPreset],
			plugins: [
				[
					compilerPlugin,
					{
						logger: {
							logEvent(_filename: string, event: CompilerEvent) {
								if (event.kind === "CompileSuccess") compiled++;
								if (event.kind === "CompileError" || event.kind === "PipelineError") {
									bailouts.push({
										file,
										line: event.fnLoc?.start?.line,
										reason:
											event.detail?.options?.reason ??
											event.detail?.reason ??
											event.data ??
											String(event.detail),
									});
								}
							},
						},
					},
				],
			],
		});
	}

	return { checkedFiles: files.size, compiledFunctions: compiled, bailouts };
}

/** Puts a rerun scenario's numbers in place of the ones in results.json, noting when and under what load it ran. */
function rerunInteractionScenario(
	rerun: Awaited<ReturnType<typeof runInteractions>>,
	scenario: string,
) {
	const [pageName, scenarioName] = scenario.split(".");
	const resultsFile = path.join(OUTPUT_DIR, "results.json");
	const results = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
	type PageResults = {
		scenarios: Record<string, unknown>;
		pooledLatency: Record<string, unknown>;
	};
	const rerunPage = (rerun.pages as unknown as Record<string, PageResults>)[pageName];
	const page = results.interactions?.pages?.[pageName] as PageResults | undefined;
	if (!rerunPage?.scenarios[scenarioName] || !page) {
		throw new Error(`No interaction scenario "${scenario}" to replace`);
	}

	page.scenarios[scenarioName] = rerunPage.scenarios[scenarioName];
	const latencyPrefix = `scenarios.${scenarioName}.`;
	for (const key of Object.keys(page.pooledLatency)) {
		if (key.startsWith(latencyPrefix)) delete page.pooledLatency[key];
	}
	for (const [key, value] of Object.entries(rerunPage.pooledLatency)) {
		if (key.startsWith(latencyPrefix)) page.pooledLatency[key] = value;
	}

	const peakLoad = Math.max(...loadSamples);
	(results.interactions.reruns ??= []).push({
		scenario,
		measuredAt: new Date().toISOString(),
		loadAverage: {
			atStart: round2(loadAverageAtStart),
			peak: round2(peakLoad),
			atEnd: round2(os.loadavg()[0]),
		},
	});
	fs.writeFileSync(resultsFile, `${JSON.stringify(results, null, "\t")}\n`);
	console.log(JSON.stringify(page.scenarios[scenarioName], null, 2));
}

/** Toggles the first team's score of a match in progress (1, 0, 1, ...) in the database both servers read. */
function matchScoreRevalidation(matchId: number) {
	const db = new DatabaseSync(path.join(ROOT, serverEnv.DB_PATH));
	const original = db
		.prepare(`select "opponentOne" from "TournamentMatch" where "id" = ?`)
		.get(matchId) as { opponentOne: string } | undefined;
	if (!original) throw new Error(`No match ${matchId} in the database`);
	const update = db.prepare(
		`update "TournamentMatch" set "opponentOne" = ? where "id" = ?`,
	);
	const scoreOf = (index: number) => (index % 2 === 0 ? 1 : 0);

	return {
		description: `20 revalidations of the page's data, each after the score of match ${matchId} changed in the database (one score text in the bracket changes, every match object is new)`,
		updates: 20,
		changeOnServer: (index: number) => {
			update.run(
				JSON.stringify({
					...JSON.parse(original.opponentOne),
					score: scoreOf(index),
				}),
				matchId,
			);
		},
		restore: () => {
			update.run(original.opponentOne, matchId);
		},
		selector: `[data-match-id="${matchId}"] [data-testid="match-score"]`,
		expectedText: (index: number) => String(scoreOf(index)),
	};
}

interface CompilerEvent {
	kind: string;
	fnLoc?: { start?: { line?: number } };
	detail?: { reason?: string; options?: { reason?: string } };
	data?: string;
}

// ---- provenance: what was measured ----

function buildProvenance() {
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
	const builds = Object.fromEntries(
		Object.values(APPS).map((app) => {
			const { output } = BUILD_INPUTS[app.name];
			const outputPath = path.join(ROOT, output);
			if (!fs.existsSync(outputPath)) {
				throw new Error(`No ${app.name} build (${output}), see the top of this file`);
			}
			const newerSources = sourcesNewerThan(app.name);
			if (newerSources.length > 0 && !allowStaleBuild) {
				throw new Error(
					`The ${app.name} build is older than its sources (${newerSources.slice(0, 5).join(", ")}): rebuild it, or pass --allow-stale-build.`,
				);
			}

			return [
				app.name,
				{
					builtAt: fs.statSync(outputPath).mtime.toISOString(),
					sourcesNewerThanBuild: newerSources,
				},
			];
		}),
	);

	return {
		gitCommit: git("rev-parse", "HEAD"),
		gitBranch: git("rev-parse", "--abbrev-ref", "HEAD"),
		// uncommitted changes the builds may contain
		gitChanges: git("status", "--porcelain").split("\n").filter(Boolean),
		builds: builds as Record<
			AppName,
			{ builtAt: string; sourcesNewerThanBuild: string[] }
		>,
	};
}

function sourcesNewerThan(app: AppName) {
	const { output, inputs } = BUILD_INPUTS[app];
	const listing = execFileSync(
		"find",
		[
			...inputs,
			...GENERATED_INPUTS.flatMap((generated) => [
				"-path",
				generated,
				"-prune",
				"-o",
			]),
			"-type",
			"f",
			"-newer",
			output,
			"-print",
		],
		{ cwd: ROOT, encoding: "utf8" },
	);

	return listing.split("\n").filter(Boolean);
}

/**
 * What only the running builds can tell: an e2e build (`VITE_E2E_TEST_RUN=true` baked in) renders the
 * hydration indicator the specs wait on, and a React build made with MEASURE_STAND_IN_SHELL=true the
 * stand-in shell. Both servers run without the e2e flag, so the indicator can only come from the build.
 */
async function checkBuilds(browser: Browser) {
	const result = {} as Record<AppName, { e2eBuild: boolean; standInShell: boolean }>;
	for (const app of Object.values(APPS)) {
		const context = await browser.newContext({
			extraHTTPHeaders: { cookie: sessionCookie },
			serviceWorkers: "block",
		});
		const page = await context.newPage();
		await page.goto(`${app.origin}/associations`, { waitUntil: "networkidle" });
		result[app.name] = {
			e2eBuild: (await page.locator('[data-testid="hydrated"]').count()) > 0,
			standInShell: (await page.locator("[data-stand-in-shell]").count()) > 0,
		};
		await context.close();
	}

	for (const [name, checks] of Object.entries(result)) {
		if (checks.e2eBuild) {
			throw new Error(
				`The ${name} build is an e2e build (VITE_E2E_TEST_RUN=true): rebuild it as the top of this file says.`,
			);
		}
	}
	if (!result.react.standInShell && !fullReactShell) {
		throw new Error(
			"The React build renders its full app shell: rebuild it with MEASURE_STAND_IN_SHELL=true, or pass --full-react-shell to measure it on purpose.",
		);
	}

	return result;
}

// ---- helpers ----

/** Retries once: a keep-alive socket the server closed for idling fails the request reusing it. */
async function fetchAsUser(url: string) {
	const init = { headers: { cookie: sessionCookie } };
	try {
		return await fetch(url, init);
	} catch {
		return fetch(url, init);
	}
}

/** Session cookie value in React Router's `createCookieSessionStorage` format, which both apps read. */
function signedSession(data: Record<string, unknown>) {
	const value = Buffer.from(JSON.stringify(data)).toString("base64");
	const signature = createHmac("sha256", SESSION_SECRET)
		.update(value)
		.digest("base64")
		.replace(/=+$/, "");

	return encodeURIComponent(`${value}.${signature}`);
}

/** A server already listening there would answer in place of the build under measurement. */
async function assertPortFree(app: App) {
	const isTaken = await fetch(app.origin).then(
		() => true,
		() => false,
	);
	if (isTaken) {
		throw new Error(
			`Something already listens on ${app.origin}: stop it, the measurement would talk to it instead of the ${app.name} build.`,
		);
	}
}

async function waitForServer(app: App, timeoutMs = 60_000) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		try {
			await fetch(app.origin);
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}
	throw new Error(`${app.name} server did not start on ${app.origin}`);
}

function argValue(name: string) {
	return process.argv
		.find((arg) => arg.startsWith(`--${name}=`))
		?.split("=")[1];
}

function round2(value: number) {
	return Math.round(value * 100) / 100;
}
