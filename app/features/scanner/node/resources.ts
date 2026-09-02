/**
 * Node IO for ScoreboardResources: reads the asset sets from the local
 * sendou-ink/assets checkout (tests and atlas builders never touch the CDN) —
 * game icons from its `img/**` tree, atlases from `scanner/v1/**`. What the
 * bundle contains lives in core/resources.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	loadPlannerStages,
	type PlannerManifest,
	type PlannerStage,
} from "../core/detectors/minimap/stage";
import type { ScoreboardResources } from "../core/detectors/scoreboard/index";
import { type AtlasMeta, type GlyphSet, loadGlyphSet } from "../core/glyphs";
import { assembleScoreboardResources } from "../core/resources";
import { SCANNER_ASSETS_DIR as ASSETS_DIR, GAME_IMG_DIR } from "./assets-dir";
import { readImage } from "./image-io";

/** Decode eagerly, defer the (CPU-heavy) glyph slicing to first access. */
async function loadAtlasLazy(name: string): Promise<() => GlyphSet | null> {
	const png = join(ASSETS_DIR, "glyphs", `${name}.png`);
	const json = join(ASSETS_DIR, "glyphs", `${name}.json`);
	if (!existsSync(png) || !existsSync(json)) return () => null;
	const meta = JSON.parse(readFileSync(json, "utf8")) as AtlasMeta;
	const image = await readImage(png);
	let set: GlyphSet | null = null;
	return () => (set ??= loadGlyphSet(image, meta));
}

/** Planner stage signatures; the (CPU) tile slicing runs on first access. */
async function loadPlannerStagesLazy(): Promise<() => PlannerStage[] | null> {
	const png = join(ASSETS_DIR, "planner", "signatures.png");
	const json = join(ASSETS_DIR, "planner", "manifest.json");
	if (!existsSync(png) || !existsSync(json)) return () => null;
	const manifest = JSON.parse(readFileSync(json, "utf8")) as PlannerManifest;
	const atlas = await readImage(png);
	let stages: PlannerStage[] | null = null;
	return () => (stages ??= loadPlannerStages(atlas, manifest));
}

/** Requires loadOpenCV() to have resolved. */
export function loadScoreboardResources(): Promise<ScoreboardResources> {
	return assembleScoreboardResources({
		readIcon: (dir, id) => readImage(join(GAME_IMG_DIR, dir, `${id}.avif`)),
		loadAtlas: loadAtlasLazy,
		loadPlannerStages: loadPlannerStagesLazy,
	});
}
