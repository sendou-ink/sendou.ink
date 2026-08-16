/**
 * manifest — maintains `migration-manifest.json` at the repo root, the single
 * source of truth for React → Svelte migration progress.
 *
 * `generate` enumerates features (from `app/features/*`) and routes (by
 * evaluating `app/routes.ts`) and merges them into the manifest, preserving
 * any statuses already recorded. Rows that no longer exist in the source are
 * dropped. `report` prints progress totals.
 *
 * Statuses advance pending → scaffolded → migrated → verified. Cutover is
 * legal only when every non-excluded row reads `verified`. `excluded` marks
 * rows that deliberately never migrate (the map planner stays React).
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const APP_ROOT = join(REPO_ROOT, "apps/web-react");
const MANIFEST_PATH = join(REPO_ROOT, "migration-manifest.json");

const STATUSES = [
	"pending",
	"scaffolded",
	"migrated",
	"verified",
	"excluded",
] as const;

type Status = (typeof STATUSES)[number];

interface FeatureRow {
	status: Status;
	notes?: string;
}

interface RouteRow {
	status: Status;
	path: string;
	feature: string;
	/** Which codemod last touched this row's scaffold, once one has. */
	codemod?: string;
	notes?: string;
}

interface Manifest {
	features: Record<string, FeatureRow>;
	routes: Record<string, RouteRow>;
}

/** Rows that deliberately never migrate, with the reason recorded. */
const EXCLUDED: Record<string, string> = {
	"map-planner":
		"stays React; served from planner.sendou.ink after cutover (plan phase 8)",
};

interface RouteConfigEntry {
	path?: string;
	file: string;
	index?: boolean;
	children?: RouteConfigEntry[];
}

async function generate() {
	const previous: Manifest = existsSync(MANIFEST_PATH)
		? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
		: { features: {}, routes: {} };

	const manifest: Manifest = { features: {}, routes: {} };

	for (const feature of readdirSync(join(APP_ROOT, "app/features")).sort()) {
		const excludedNote = EXCLUDED[feature];
		manifest.features[feature] = previous.features[feature] ?? {
			status: excludedNote ? "excluded" : "pending",
			...(excludedNote ? { notes: excludedNote } : {}),
		};
	}

	const routeModule = await import(join(APP_ROOT, "app/routes.ts"));
	for (const { file, path } of flattenRoutes(routeModule.default, "")) {
		const feature = file.split("/")[1] ?? "unknown";
		const excludedNote = EXCLUDED[feature];
		manifest.routes[file] = previous.routes[file] ?? {
			status: excludedNote ? "excluded" : "pending",
			path,
			feature,
			...(excludedNote ? { notes: excludedNote } : {}),
		};
	}

	writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, "\t")}\n`);
	const dropped = [
		...Object.keys(previous.features).filter((f) => !manifest.features[f]),
		...Object.keys(previous.routes).filter((r) => !manifest.routes[r]),
	];
	process.stdout.write(
		`manifest: ${Object.keys(manifest.features).length} features, ${
			Object.keys(manifest.routes).length
		} routes${dropped.length > 0 ? `, dropped ${dropped.join(", ")}` : ""}\n`,
	);
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

function report() {
	const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
	for (const [label, rows] of [
		["features", Object.values(manifest.features)],
		["routes", Object.values(manifest.routes)],
	] as const) {
		const counts = new Map<Status, number>();
		for (const row of rows) {
			counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
		}
		const parts = STATUSES.filter((s) => counts.has(s)).map(
			(s) => `${counts.get(s)} ${s}`,
		);
		process.stdout.write(`${label} (${rows.length}): ${parts.join(", ")}\n`);
	}
}

const command = process.argv[2];
if (command === "generate") {
	await generate();
} else if (command === "report") {
	report();
} else {
	process.stderr.write("usage: manifest.ts <generate|report>\n");
	process.exit(1);
}
