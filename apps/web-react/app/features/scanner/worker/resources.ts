/**
 * Worker/browser IO for ScoreboardResources: fetches over HTTP. Game icons
 * come from the CDN's shared `img/<dir>/<id>.avif` sets the rest of the app
 * already uses; the scanner-specific atlases (glyphs, planner signatures) are
 * served same-origin from this repo's `public/scanner/v1/**`. What the bundle
 * contains — every key, template option set, and atlas name — lives in
 * core/resources.ts, shared with the Node loader. The base URL arrives via
 * the worker init message (see worker/protocol.ts) so this module never
 * imports the app config.
 */

import {
	loadPlannerStages,
	type PlannerManifest,
	type PlannerStage,
} from "../core/detectors/minimap/stage";
import type { ScoreboardResources } from "../core/detectors/scoreboard/index";
import { type AtlasMeta, type GlyphSet, loadGlyphSet } from "../core/glyphs";
import type { FrameData } from "../core/image";
import { assembleScoreboardResources } from "../core/resources";

/** Scanner parser atlases; the version segment guards against CDN cache skew —
 * bump it together with breaking atlas format changes (must match the
 * Node-side SCANNER_ASSETS_DIR default in node/assets-dir.ts).
 * xxx: temporarily served same-origin from this repo's public/ while the
 * feature is in development; move to the assets repo CDN
 * (`${base}/scanner/v1`) later */
const ATLAS_BASE = "/scanner/v1";

async function fetchImage(url: string): Promise<FrameData> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
	const bitmap = await createImageBitmap(await res.blob());
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
	return { width: data.width, height: data.height, data: data.data };
}

function makeFetchAtlas(base: string) {
	return async function fetchAtlas(
		name: string,
	): Promise<() => GlyphSet | null> {
		try {
			const [meta, image] = await Promise.all([
				fetch(`${base}/glyphs/${name}.json`).then((r) => {
					if (!r.ok) throw new Error(String(r.status));
					return r.json() as Promise<AtlasMeta>;
				}),
				fetchImage(`${base}/glyphs/${name}.png`),
			]);
			const set = loadGlyphSet(image, meta);
			return () => set;
		} catch {
			return () => null;
		}
	};
}

function makeFetchPlannerStages(base: string) {
	return async function fetchPlannerStages(): Promise<
		() => PlannerStage[] | null
	> {
		try {
			const [manifest, atlas] = await Promise.all([
				fetch(`${base}/planner/manifest.json`).then((r) => {
					if (!r.ok) throw new Error(String(r.status));
					return r.json() as Promise<PlannerManifest>;
				}),
				fetchImage(`${base}/planner/signatures.png`),
			]);
			const stages = loadPlannerStages(atlas, manifest);
			return () => stages;
		} catch {
			return () => null;
		}
	};
}

/** Requires loadOpenCV() to have resolved. */
export function fetchScoreboardResources(
	base: string,
): Promise<ScoreboardResources> {
	return assembleScoreboardResources({
		readIcon: (dir, id) => fetchImage(`${base}/img/${dir}/${id}.avif`),
		loadAtlas: makeFetchAtlas(ATLAS_BASE),
		loadPlannerStages: makeFetchPlannerStages(ATLAS_BASE),
	});
}
