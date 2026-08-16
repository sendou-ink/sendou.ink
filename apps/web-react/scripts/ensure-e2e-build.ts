import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const BUILD_MARKER_FILE = ".e2e-build-marker";
const BUILD_INPUTS = [
	"app",
	"public",
	"package.json",
	"../../pnpm-lock.yaml",
	"vite.config.ts",
	"react-router.config.ts",
];

/**
 * Ensures `build/` holds a production build made with the e2e flag baked in
 * (`VITE_E2E_TEST_RUN=true`), reusing the previous build when no build input
 * changed since its marker was written. Shared by the e2e global setup and the
 * differ, which both serve this build. `siteDomain` is baked into the client
 * bundle; runtime servers on other ports override it via their environment.
 *
 * The last e2e build can be reused when no build input changed since its
 * marker was written. Directory mtimes catch deletes and renames; a build made
 * outside the e2e flow (no marker, or output newer than the marker) forces a
 * rebuild, as does a marker from a different port setup. E2E_FORCE_BUILD=true
 * overrides.
 */
export function ensureE2eBuild(siteDomain: string): { reused: boolean } {
	if (isBuildFresh(siteDomain)) {
		return { reused: true };
	}

	fs.rmSync(path.join(ROOT_DIR, BUILD_MARKER_FILE), { force: true });
	execSync("pnpm run build", {
		stdio: "inherit",
		cwd: ROOT_DIR,
		env: {
			...process.env,
			VITE_E2E_TEST_RUN: "true",
			VITE_SITE_DOMAIN: siteDomain,
			// Skalop is disconnected in e2e: all workers sharing one instance
			// cross-talk (identical seeded row ids -> colliding room names ->
			// spurious revalidations). When e2e tests for chat etc. are added
			// this needs an actual solution: one skalop (or stub) per worker
			// with a runtime-derived ws URL, since this build is shared.
			VITE_SKALOP_WS_URL: "",
		},
	});
	fs.writeFileSync(
		path.join(ROOT_DIR, BUILD_MARKER_FILE),
		JSON.stringify({ siteDomain, skalopWsUrl: "" }),
	);

	return { reused: false };
}

function isBuildFresh(siteDomain: string): boolean {
	if (process.env.E2E_FORCE_BUILD === "true") return false;

	const markerPath = path.join(ROOT_DIR, BUILD_MARKER_FILE);
	const serverEntryPath = path.join(ROOT_DIR, "build/server/index.js");
	if (!fs.existsSync(markerPath)) return false;
	if (!fs.existsSync(serverEntryPath)) return false;

	try {
		const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
		if (marker.siteDomain !== siteDomain) return false;
		if (marker.skalopWsUrl !== "") return false;
	} catch {
		return false;
	}

	const markerMtime = fs.statSync(markerPath).mtimeMs;
	if (fs.statSync(serverEntryPath).mtimeMs > markerMtime) return false;

	try {
		const changedInput = execSync(
			`find ${BUILD_INPUTS.join(" ")} -newer ${BUILD_MARKER_FILE} -print -quit`,
			{ cwd: ROOT_DIR },
		)
			.toString()
			.trim();
		return changedInput === "";
	} catch {
		return false;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const siteDomain = process.env.E2E_BUILD_SITE_DOMAIN;
	if (!siteDomain) {
		throw new Error("E2E_BUILD_SITE_DOMAIN must be set");
	}
	const { reused } = ensureE2eBuild(siteDomain);
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(reused ? "Reusing existing e2e build" : "Built the application");
}
