/**
 * Worker/browser IO for ScoreboardResources over HTTP: game icons come from
 * the CDN's shared `img/<dir>/<id>.avif` sets, the scanner atlases from the
 * same CDN under `scanner/v1/**`. What the bundle contains lives in
 * core/resources.ts. The base URL arrives via the worker init message
 * (worker/protocol.ts) so this module never imports the app config.
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

/**
 * Atlas path relative to the CDN base; the version segment guards against
 * cache skew — bump it with breaking atlas format changes (must match the
 * Node-side SCANNER_ASSETS_DIR default in node/assets-dir.ts).
 */
const ATLAS_PATH = "scanner/v1";

/** A failed fetch is tried once more after this, riding out a dropped connection or a CDN hiccup. */
const RETRY_DELAY_MS = 1_000;

/**
 * Atlases mutate at a fixed URL and each one's .png and .json cache on their
 * own, so they are revalidated on every load rather than risking a fresh
 * image paired with a stale meta.
 */
const ATLAS_FETCH: RequestInit = { cache: "no-cache" };

interface FetchedResources {
	resources: ScoreboardResources;
	/** atlases (and the planner set) that failed to load: their reads come back null */
	missingAtlases: string[];
	/** `<dir>/<id>` of game icons that failed to load: their templates are left out */
	missingIcons: string[];
}

/** Requires loadOpenCV() to have resolved. */
export async function fetchScoreboardResources(
	base: string,
): Promise<FetchedResources> {
	const missingAtlases: string[] = [];
	const recordMissing = <T>(name: string, load: Promise<(() => T) | null>) =>
		load.then((getter) => {
			if (getter) return getter;
			missingAtlases.push(name);
			return () => null;
		});
	const atlasBase = `${base}/${ATLAS_PATH}`;
	const { resources, missingIcons } = await assembleScoreboardResources({
		readIcon: (dir, id) => fetchImage(`${base}/img/${dir}/${id}.avif`),
		loadAtlas: (name) => recordMissing(name, fetchAtlas(atlasBase, name)),
		loadPlannerStages: () =>
			recordMissing("planner", fetchPlannerStages(atlasBase)),
	});
	return { resources, missingAtlases, missingIcons };
}

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
	try {
		return await fetchOnce(url, init);
	} catch {
		await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
		return fetchOnce(url, init);
	}
}

async function fetchOnce(url: string, init?: RequestInit): Promise<Response> {
	const res = await fetch(url, init);
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
	return res;
}

async function fetchImage(url: string, init?: RequestInit): Promise<FrameData> {
	const res = await fetchOk(url, init);
	const bitmap = await createImageBitmap(await res.blob());
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
	return { width: data.width, height: data.height, data: data.data };
}

/** Null when the atlas could not be loaded. */
async function fetchAtlas(
	base: string,
	name: string,
): Promise<(() => GlyphSet) | null> {
	try {
		const [meta, image] = await Promise.all([
			fetchOk(`${base}/glyphs/${name}.json`, ATLAS_FETCH).then(
				(res) => res.json() as Promise<AtlasMeta>,
			),
			fetchImage(`${base}/glyphs/${name}.png`, ATLAS_FETCH),
		]);
		const set = loadGlyphSet(image, meta);
		return () => set;
	} catch {
		return null;
	}
}

/** Null when the planner signatures could not be loaded. */
async function fetchPlannerStages(
	base: string,
): Promise<(() => PlannerStage[]) | null> {
	try {
		const [manifest, atlas] = await Promise.all([
			fetchOk(`${base}/planner/manifest.json`, ATLAS_FETCH).then(
				(res) => res.json() as Promise<PlannerManifest>,
			),
			fetchImage(`${base}/planner/signatures.png`, ATLAS_FETCH),
		]);
		const stages = loadPlannerStages(atlas, manifest);
		return () => stages;
	} catch {
		return null;
	}
}
