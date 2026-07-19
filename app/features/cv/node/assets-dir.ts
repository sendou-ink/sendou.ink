/**
 * Where Node-side code (tests, atlas builders) reads and writes the CV
 * asset sets. Defaults to the sibling sendou-ink/assets checkout — the same
 * files the CDN mirrors — and can be overridden with CV_ASSETS_DIR. The
 * version segment must match worker-side CV_ASSETS_URL (app/utils/urls.ts).
 */
export const CV_ASSETS_DIR =
	process.env.CV_ASSETS_DIR ??
	new URL("../../../../../assets/assets/cv/v1", import.meta.url).pathname;
