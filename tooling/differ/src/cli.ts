import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runDiff } from "./differ.ts";
import { ensureMinio, LEFT_DB, prepare, RIGHT_DB } from "./prepare.ts";
import { startServers, stopServers } from "./servers.ts";
import type { Report, RunConfig, Viewport } from "./types.ts";

const DIFFER_DIR = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const REPO_ROOT = path.join(DIFFER_DIR, "..", "..");

const VIEWPORTS: Record<string, Viewport> = {
	desktop: { name: "desktop", width: 1440, height: 900 },
	mobile: { name: "mobile", width: 375, height: 667 },
};

const { values } = parseArgs({
	options: {
		filter: { type: "string" },
		"max-rows": { type: "string" },
		themes: { type: "string", default: "light,dark" },
		viewports: { type: "string", default: "desktop,mobile" },
		concurrency: { type: "string", default: "1" },
		"seed-now": { type: "string" },
		"skip-prepare": { type: "boolean", default: false },
		out: { type: "string" },
	},
});

const seedNow = values["seed-now"]
	? new Date(values["seed-now"]).getTime()
	: Date.now();
if (Number.isNaN(seedNow)) {
	throw new Error(`--seed-now is not a valid date: ${values["seed-now"]}`);
}

const outDir = values.out
	? path.resolve(values.out)
	: path.join(
			DIFFER_DIR,
			"output",
			new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19),
		);
fs.mkdirSync(outDir, { recursive: true });

const webReactDir = path.join(REPO_ROOT, "apps", "web-react");

// same derivation as the e2e helpers' E2E_BASE_PORT, so the build is shared;
// only PORT is read from .env — the rest must not leak into the differ servers
const envPort = (() => {
	try {
		const envFile = fs.readFileSync(path.join(webReactDir, ".env"), "utf8");
		return envFile.match(/^PORT=(\d+)/m)?.[1];
	} catch {
		return undefined;
	}
})();
const e2eBasePort = Number(process.env.PORT || envPort || 5173) + 500;

const config: RunConfig = {
	repoRoot: REPO_ROOT,
	webReactDir,
	bakedSiteDomain: `http://localhost:${e2eBasePort}`,
	outDir,
	seedNow,
	leftPort: 6873,
	rightPort: 6874,
	themes: values.themes.split(","),
	viewports: values.viewports.split(",").map((name) => {
		const viewport = VIEWPORTS[name];
		if (!viewport) {
			throw new Error(
				`Unknown viewport "${name}" (known: ${Object.keys(VIEWPORTS).join(", ")})`,
			);
		}
		return viewport;
	}),
	concurrency: Number(values.concurrency),
	filter: values.filter ?? null,
	maxRows: values["max-rows"] ? Number(values["max-rows"]) : null,
	skipPrepare: values["skip-prepare"],
};

const census = prepare(config);
await ensureMinio();

const servers = await startServers(config, { left: LEFT_DB, right: RIGHT_DB });
process.on("exit", () => stopServers(servers));
process.on("SIGINT", () => {
	stopServers(servers);
	process.exit(130);
});

log(`Diffing ${servers[0].baseURL} (left) vs ${servers[1].baseURL} (right)`);

let report: Report;
try {
	report = await runDiff(config, census, servers);
} finally {
	stopServers(servers);
}

fs.writeFileSync(
	path.join(outDir, "report.json"),
	JSON.stringify(report, null, "\t"),
);

const { summary } = report;
log("");
log(`Report: ${path.join(outDir, "report.json")}`);
log(
	`Rows: ${report.rows.length} diffed, ${report.skippedRows.length} skipped by census`,
);
log(`Pixel failures:    ${summary.pixelFailures} (gate)`);
log(`Head failures:     ${summary.htmlFailures} (gate)`);
log(`Resource failures: ${summary.resourceFailures} (gate)`);
log(`ARIA changes:      ${summary.ariaChanges} (advisory)`);
log(`Error pages:       ${summary.errorPages} (seed coverage, advisory)`);

const gateFailed =
	summary.pixelFailures + summary.htmlFailures + summary.resourceFailures > 0;
log("");
log(gateFailed ? "DIFFER: FAIL" : "DIFFER: PASS");
process.exit(gateFailed ? 1 : 0);

function log(message: string) {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(message);
}
