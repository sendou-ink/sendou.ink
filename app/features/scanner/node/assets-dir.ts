/**
 * Where Node-side code reads and writes the scanner asset sets, all in the
 * sibling sendou-ink/assets checkout the CDN mirrors. SCANNER_ASSETS_DIR is
 * their root (overridable by env var of the same name); every set is
 * versioned on its own under it, and each version segment must match its
 * worker-side path (GLYPHS_PATH and PLANNER_PATH in worker/resources.ts,
 * MUSIC_PATH in capture/music-tracks.ts). GAME_IMG_DIR is the shared `img/**`
 * tree the game icons come from.
 */
const ASSETS_REPO_DIR = new URL("../../../../../assets/assets", import.meta.url)
	.pathname;

const SCANNER_ASSETS_DIR =
	process.env.SCANNER_ASSETS_DIR ?? `${ASSETS_REPO_DIR}/scanner`;

export const GLYPH_ATLAS_DIR = `${SCANNER_ASSETS_DIR}/v2/glyphs`;
export const PLANNER_DIR = `${SCANNER_ASSETS_DIR}/v1/planner`;
export const MUSIC_DIR = `${SCANNER_ASSETS_DIR}/v1/bgm`;

export const GAME_IMG_DIR = `${ASSETS_REPO_DIR}/img`;
