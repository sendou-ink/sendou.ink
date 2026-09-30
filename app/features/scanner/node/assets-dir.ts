/**
 * Where Node-side code reads and writes the scanner asset sets, both in the
 * sibling sendou-ink/assets checkout the CDN mirrors. SCANNER_ASSETS_DIR holds
 * the atlases (overridable by env var of the same name); its version segment
 * must match the worker-side ATLAS_PATH (worker/resources.ts). GAME_IMG_DIR
 * is the shared `img/**` tree the game icons come from.
 */
const ASSETS_REPO_DIR = new URL("../../../../../assets/assets", import.meta.url)
	.pathname;

export const SCANNER_ASSETS_DIR =
	process.env.SCANNER_ASSETS_DIR ?? `${ASSETS_REPO_DIR}/scanner/v1`;

export const GAME_IMG_DIR = `${ASSETS_REPO_DIR}/img`;
