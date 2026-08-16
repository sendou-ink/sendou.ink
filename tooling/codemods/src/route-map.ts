/**
 * route-map — maps React Router routes (`app/routes.ts`) to SvelteKit route
 * directories in `apps/web/src/routes`, generating thin scaffold files for
 * routes that don't exist yet. Idempotent: existing files are never touched.
 *
 * Usage:
 *   node src/route-map.ts --path /leaderboards   scaffold one URL path
 *   node src/route-map.ts --all                  scaffold every non-excluded route
 *   node src/route-map.ts --list                 print the path → directory mapping
 *
 * `.tsx` route files scaffold a `+page.svelte` (with an @MIGRATE marker), plain
 * `.ts` route files a `+server.ts`. Scaffolded rows advance to `scaffolded` in
 * the migration manifest with `codemod: "route-map"`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const APP_ROOT = join(REPO_ROOT, "apps/web-react");
const WEB_ROUTES_ROOT = join(REPO_ROOT, "apps/web/src/routes");
const MANIFEST_PATH = join(REPO_ROOT, "migration-manifest.json");

interface RouteConfigEntry {
	path?: string;
	file: string;
	index?: boolean;
	children?: RouteConfigEntry[];
}

interface ManifestRouteRow {
	status: string;
	path: string;
	feature: string;
	codemod?: string;
	notes?: string;
}

interface Manifest {
	features: Record<string, { status: string; notes?: string }>;
	routes: Record<string, ManifestRouteRow>;
}

const { values } = parseArgs({
	options: {
		path: { type: "string" },
		all: { type: "boolean", default: false },
		list: { type: "boolean", default: false },
	},
});

const routeModule = await import(join(APP_ROOT, "app/routes.ts"));
const routes = [...flattenRoutes(routeModule.default, "")];

if (values.list) {
	for (const route of routes) {
		process.stdout.write(
			`${route.path.padEnd(45)} → src/routes/${reactPathToSvelteDir(route.path)}/${route.file.endsWith(".tsx") ? "+page.svelte" : "+server.ts"}\n`,
		);
	}
	process.exit(0);
}

const selected = values.all
	? routes
	: routes.filter((route) => route.path === values.path);

if (selected.length === 0) {
	process.stderr.write(
		values.path
			? `route-map: no route with path ${values.path}\n`
			: "usage: route-map.ts <--path /url | --all | --list>\n",
	);
	process.exit(1);
}

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
let scaffolded = 0;
let skipped = 0;

for (const route of selected) {
	const dir = reactPathToSvelteDir(route.path);
	const isPage = route.file.endsWith(".tsx");
	const target = join(
		WEB_ROUTES_ROOT,
		dir,
		isPage ? "+page.svelte" : "+server.ts",
	);

	if (existsSync(target)) {
		skipped++;
		continue;
	}

	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, isPage ? pageScaffold(route) : serverScaffold(route));
	scaffolded++;

	const row = manifest.routes[route.file];
	if (row) {
		row.codemod = "route-map";
		if (row.status === "pending") {
			row.status = "scaffolded";
		}
	}
}

writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, "\t")}\n`);
process.stdout.write(
	`route-map: ${scaffolded} scaffolded, ${skipped} already existed\n`,
);

function pageScaffold(route: { file: string; path: string }) {
	const feature = route.file.split("/")[1] ?? "unknown";
	return `<script lang="ts">
	// @MIGRATE port the route component from apps/web-react/app/${route.file}
	// (thin shell: compose components from #lib/features/${feature}/components/
	// and wire the feature's remote functions; see MIGRATION.md)
</script>

<h1>@MIGRATE ${route.path}</h1>
`;
}

function serverScaffold(route: { file: string; path: string }) {
	return `import type { RequestHandler } from "./$types";

// @MIGRATE port the resource route from apps/web-react/app/${route.file}

export const GET: RequestHandler = () => {
	throw new Error("@MIGRATE ${route.path} not implemented");
};
`;
}

function reactPathToSvelteDir(urlPath: string): string {
	if (urlPath === "/") return "";
	return urlPath
		.replace(/^\//, "")
		.split("/")
		.map((segment) => {
			if (segment === "*") return "[...rest]";
			if (segment.endsWith("?") && segment.startsWith(":")) {
				return `[[${segment.slice(1, -1)}]]`;
			}
			if (segment.startsWith(":")) return `[${segment.slice(1)}]`;
			return segment;
		})
		.join("/");
}

function* flattenRoutes(
	entries: RouteConfigEntry[],
	parentPath: string,
): Generator<{ file: string; path: string }> {
	for (const entry of entries) {
		const path = entry.index
			? parentPath || "/"
			: joinPaths(parentPath, entry.path);
		yield { file: entry.file, path };
		if (entry.children) {
			yield* flattenRoutes(entry.children, path);
		}
	}
}

function joinPaths(parent: string, child: string | undefined): string {
	if (!child) return parent || "/";
	if (child.startsWith("/")) return child;
	return `${parent.replace(/\/$/, "")}/${child}`;
}
