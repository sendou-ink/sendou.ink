/**
 * remote-scaffold — scaffolds a feature's `<feature>.remote.ts` from its React
 * Router loader and action files: every `loaders/*.server.ts` becomes a
 * `query()` stub, every `_action("NAME")` branch of the action schema becomes
 * its own `command()` stub. The original server code is referenced (not
 * copied); the migrating agent ports the bodies per MIGRATION.md and converts
 * the schemas with zod-to-valibot. Idempotent: an existing remote file is
 * never overwritten.
 *
 * Usage:
 *   node src/remote-scaffold.ts --feature leaderboards           write the scaffold
 *   node src/remote-scaffold.ts --feature leaderboards --print   print instead of writing
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const APP_ROOT = join(REPO_ROOT, "apps/web-react");
const WEB_LIB_ROOT = join(REPO_ROOT, "apps/web/src/lib");
const MANIFEST_PATH = join(REPO_ROOT, "migration-manifest.json");

const { values } = parseArgs({
	options: {
		feature: { type: "string" },
		print: { type: "boolean", default: false },
	},
});

if (!values.feature) {
	process.stderr.write(
		"usage: remote-scaffold.ts --feature <name> [--print]\n",
	);
	process.exit(1);
}

const feature = values.feature;
const featureDir = join(APP_ROOT, "app/features", feature);
if (!existsSync(featureDir)) {
	process.stderr.write(`remote-scaffold: no feature named ${feature}\n`);
	process.exit(1);
}

const loaderFiles = listServerFiles(join(featureDir, "loaders"));
const actionFiles = listServerFiles(join(featureDir, "actions"));

const queries = loaderFiles.map((file) => ({
	file: `app/features/${feature}/loaders/${file}`,
	name: `get${pascalCase(file.replace(".server.ts", ""))}`,
}));

const commands = actionFiles.flatMap((file) => {
	const source = readFileSync(
		join(featureDir, "actions", file),
		"utf8",
	);
	const schemaImports = source.match(/from "[^"]*-schemas"/g) ?? [];
	const schemaSources = [
		source,
		...schemaImports.flatMap(() => {
			const schemaFile = join(featureDir, `${feature}-schemas.ts`);
			return existsSync(schemaFile) ? [readFileSync(schemaFile, "utf8")] : [];
		}),
	].join("\n");

	const actionNames = [
		...new Set(
			[...schemaSources.matchAll(/_action\("([A-Z0-9_]+)"\)/g)].map(
				(match) => match[1],
			),
		),
	];

	return actionNames.map((actionName) => ({
		file: `app/features/${feature}/actions/${file}`,
		actionName,
		name: camelCase(actionName),
	}));
});

if (queries.length === 0 && commands.length === 0) {
	process.stderr.write(
		`remote-scaffold: ${feature} has no loaders/ or actions/ files\n`,
	);
	process.exit(1);
}

const scaffold = `import * as v from "valibot";
import { command, query } from "$app/server";

${queries
	.map(
		(query) => `export const ${query.name} = query(
	// @MIGRATE args schema: the search params / route params the loader read,
	// converted to valibot (zod-to-valibot)
	v.object({}),
	async (args) => {
		// @MIGRATE port the loader body from ${query.file}
		// (see MIGRATION.md "Read path"; auth via getUser()/requireUser())
		throw new Error("@MIGRATE ${query.name} not implemented");
	},
);
`,
	)
	.join("\n")}${commands
	.map(
		(cmd) => `
export const ${cmd.name} = command(
	// @MIGRATE fields schema of the ${cmd.actionName} branch (zod-to-valibot)
	v.object({}),
	async (args) => {
		// @MIGRATE port the ${cmd.actionName} branch from ${cmd.file}
		// (see MIGRATION.md "Write path"; refresh the queries this invalidates)
		throw new Error("@MIGRATE ${cmd.name} not implemented");
	},
);
`,
	)
	.join("")}`;

if (values.print) {
	process.stdout.write(scaffold);
	process.exit(0);
}

const targetDir = join(WEB_LIB_ROOT, "features", feature);
const target = join(targetDir, `${feature}.remote.ts`);

if (existsSync(target)) {
	process.stdout.write(
		`remote-scaffold: ${target.replace(`${REPO_ROOT}/`, "")} already exists, leaving it alone\n`,
	);
	process.exit(0);
}

mkdirSync(targetDir, { recursive: true });
writeFileSync(target, scaffold);

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const featureRow = manifest.features?.[feature];
if (featureRow && featureRow.status === "pending") {
	featureRow.status = "scaffolded";
	writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, "\t")}\n`);
}

process.stdout.write(
	`remote-scaffold: wrote ${target.replace(`${REPO_ROOT}/`, "")} (${queries.length} queries, ${commands.length} commands)\n`,
);

function listServerFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((file) => file.endsWith(".server.ts"))
		.sort();
}

function pascalCase(value: string): string {
	return value
		.split(/[-_.]/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

function camelCase(value: string): string {
	const pascal = pascalCase(value.toLowerCase());
	return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
