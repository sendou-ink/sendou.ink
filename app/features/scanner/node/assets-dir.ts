/**
 * Where Node-side code (tests, atlas builders) reads and writes the scanner
 * asset sets. SCANNER_ASSETS_DIR holds the scanner-specific atlases (glyphs, planner
 * signatures; overridable with the env var of the same name) — its version
 * segment must match the worker-side ATLAS_BASE (worker/resources.ts).
 * GAME_IMG_DIR is the sibling sendou-ink/assets checkout's shared `img/**`
 * tree the game icons are read from — the same files the CDN mirrors.
 * xxx: atlases temporarily live in this repo's public/ while the feature
 * is in development; move them to the assets repo later
 */
export const SCANNER_ASSETS_DIR =
	process.env.SCANNER_ASSETS_DIR ??
	new URL("../../../../public/scanner/v1", import.meta.url).pathname;

export const GAME_IMG_DIR = new URL(
	"../../../../../assets/assets/img",
	import.meta.url,
).pathname;
