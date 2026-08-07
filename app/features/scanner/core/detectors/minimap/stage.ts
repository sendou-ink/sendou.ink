/**
 * Stage identification for the minimap overlay by matching the drawn map
 * against sendou.ink planner renders (assets/cv/planner/, one PNG per
 * stage x mode, packed as a signature atlas).
 *
 * The map is drawn sharp over blurred gameplay, so a Laplacian edge mask
 * isolates it; dropping saturated (team-ink) edges leaves a structural,
 * ink-invariant signature. Downscaling+blurring also absorbs the POV (map
 * fills screen) vs spectator (map smaller, centered) scale/offset
 * difference, letting one atlas serve both via a translation search.
 *
 * Stage separates cleanly this way (NCC leads the next stage by
 * ~0.17-0.26). Mode does NOT — the objective marker is the only per-mode
 * difference and ink-invariance strips it — so the atlas keeps all five
 * renders per stage and reports only the winning tile's stage; mode comes
 * from map-start/scoreboard header instead.
 */
import type { StageId } from "~/modules/in-game-lists/types";
import { getCV, type Mat } from "../../cv";
import type { FrameData } from "../../image";

/** Downscaled signature dimensions (canonical 1920x1080 / 16). */
export const PLANNER_SIG_W = 120;
export const PLANNER_SIG_H = 68;
/** |Laplacian| floor separating render edges from the blur (blur ~0-5). */
const EDGE_MIN = 24;
/** HSV saturation at/above which an edge pixel is team ink, not structure. */
const INK_SATURATION_MIN = 80;
/** Half-range (signature px, ~16x canonical) of the alignment search. */
const MATCH_RANGE = 8;
/** Below this best NCC, or this lead over the next stage, report nothing. */
const MIN_SCORE = 0.5;
const MIN_MARGIN = 0.05;

export interface PlannerStage {
	/** "<stageId>-<MODE>", e.g. "6-SZ" */
	key: string;
	/** sendou stage id */
	stageId: StageId;
	/** unit-L2-normalized structural signature, row-major PLANNER_SIG_W x _H */
	sig: Float32Array;
}

export interface StageMatch {
	stageId: StageId;
	/** best NCC of the winning stage */
	score: number;
	/** lead over the best-scoring other stage */
	margin: number;
}

/**
 * Ink-invariant structural signature of a canonical-normalized RGBA frame:
 * downscaled, blurred, unit-L2-normalized float mask of the non-ink render
 * edges. Shared by the build tool and the runtime matcher so the atlas and
 * the live frame are computed identically.
 */
export function plannerSignature(frame: Mat): Float32Array {
	const cv = getCV();
	const gray = new cv.Mat();
	cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
	const rgb = new cv.Mat();
	cv.cvtColor(frame, rgb, cv.COLOR_RGBA2RGB);
	const hsv = new cv.Mat();
	cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
	rgb.delete();

	const lap = new cv.Mat();
	cv.Laplacian(gray, lap, cv.CV_16S, 3);
	gray.delete();
	const edges = new cv.Mat();
	cv.convertScaleAbs(lap, edges);
	lap.delete();
	const mask = new cv.Mat();
	cv.threshold(edges, mask, EDGE_MIN, 255, cv.THRESH_BINARY);
	edges.delete();

	// drop saturated (ink) edges, keeping only the structural skeleton
	const n = mask.rows * mask.cols;
	const md = mask.data;
	const hd = hsv.data;
	for (let i = 0; i < n; i++) {
		if (hd[i * 3 + 1]! >= INK_SATURATION_MIN) md[i] = 0;
	}
	hsv.delete();

	const down = new cv.Mat();
	cv.resize(
		mask,
		down,
		new cv.Size(PLANNER_SIG_W, PLANNER_SIG_H),
		0,
		0,
		cv.INTER_AREA,
	);
	mask.delete();
	const blur = new cv.Mat();
	cv.GaussianBlur(down, blur, new cv.Size(5, 5), 0);
	down.delete();

	const out = new Float32Array(PLANNER_SIG_W * PLANNER_SIG_H);
	const bd = blur.data;
	let sumSq = 0;
	for (let i = 0; i < out.length; i++) {
		out[i] = bd[i]!;
		sumSq += out[i]! * out[i]!;
	}
	blur.delete();
	const norm = Math.sqrt(sumSq) || 1;
	for (let i = 0; i < out.length; i++) out[i]! /= norm;
	return out;
}

/** Dot product of `a` against `b` shifted by (dx, dy) over their overlap. */
function shiftedDot(
	a: Float32Array,
	b: Float32Array,
	dx: number,
	dy: number,
): number {
	let dot = 0;
	for (let y = 0; y < PLANNER_SIG_H; y++) {
		const sy = y + dy;
		if (sy < 0 || sy >= PLANNER_SIG_H) continue;
		const ar = y * PLANNER_SIG_W;
		const br = sy * PLANNER_SIG_W;
		for (let x = 0; x < PLANNER_SIG_W; x++) {
			const sx = x + dx;
			if (sx < 0 || sx >= PLANNER_SIG_W) continue;
			dot += a[ar + x]! * b[br + sx]!;
		}
	}
	return dot;
}

/** Best NCC of two unit signatures over a small translation search. */
function bestNcc(a: Float32Array, b: Float32Array): number {
	let best = -1;
	for (let dy = -MATCH_RANGE; dy <= MATCH_RANGE; dy += 2) {
		for (let dx = -MATCH_RANGE; dx <= MATCH_RANGE; dx += 2) {
			const v = shiftedDot(a, b, dx, dy);
			if (v > best) best = v;
		}
	}
	return best;
}

/**
 * Identify the stage of a minimap frame's signature against the planner
 * atlas. Returns null when no stage matches confidently (score floor) or two
 * stages are too close to call (margin floor) — e.g. a stage not in the set.
 */
export function matchStage(
	sig: Float32Array,
	planners: readonly PlannerStage[],
): StageMatch | null {
	if (planners.length === 0) return null;
	const byStage = new Map<StageId, number>();
	for (const p of planners) {
		const score = bestNcc(sig, p.sig);
		const prev = byStage.get(p.stageId);
		if (prev === undefined || score > prev) byStage.set(p.stageId, score);
	}
	let bestId: StageId | null = null;
	let best = -1;
	let second = -1;
	for (const [id, score] of byStage) {
		if (score > best) {
			second = best;
			best = score;
			bestId = id;
		} else if (score > second) {
			second = score;
		}
	}
	const margin = second < 0 ? best : best - second;
	if (bestId === null || best < MIN_SCORE || margin < MIN_MARGIN) return null;
	return {
		stageId: bestId,
		score: Math.round(best * 1000) / 1000,
		margin: Math.round(margin * 1000) / 1000,
	};
}

export interface PlannerManifest {
	width: number;
	height: number;
	/** tiles packed left-to-right, top-to-bottom, this many per row */
	cols: number;
	/** tile keys in packing order */
	keys: string[];
}

/**
 * Slice the packed signature atlas (grayscale uint8 tiles) back into
 * unit-normalized PlannerStage signatures. Mirrors loadGlyphSet's atlas
 * convention; the build tool writes the atlas + manifest.
 */
export function loadPlannerStages(
	atlas: FrameData,
	manifest: PlannerManifest,
): PlannerStage[] {
	const { width, height, cols, keys } = manifest;
	const aw = atlas.width;
	const data = atlas.data;
	return keys.map((key, i) => {
		const tx = (i % cols) * width;
		const ty = Math.floor(i / cols) * height;
		const sig = new Float32Array(width * height);
		let sumSq = 0;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				// atlas is RGBA; the tiles are grayscale, so read the red channel
				const v = data[((ty + y) * aw + (tx + x)) * 4]!;
				sig[y * width + x] = v;
				sumSq += v * v;
			}
		}
		const norm = Math.sqrt(sumSq) || 1;
		for (let j = 0; j < sig.length; j++) sig[j]! /= norm;
		const stageId = Number(key.split("-")[0]) as StageId;
		return { key, stageId, sig };
	});
}
