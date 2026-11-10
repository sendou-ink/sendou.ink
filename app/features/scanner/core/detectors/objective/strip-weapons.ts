/**
 * StripWeapons: per-slot weapon-icon evidence off the PlayerStatus icon strip,
 * sampled by the ObjectiveDetector. The strip keeps its own slot order (it can
 * change every game) while the results scoreboard re-sorts each team, so the
 * match builder aggregates these candidate lists into the slot→row assignment
 * (slot-row-assignment.ts). The strip fit pins each icon's scale and roughly
 * its center, so a slot is resampled to the reference pitch and scored against
 * every weapon's game icon at that one size, searched sideways: the art's
 * opaque pixels as drawn, plus its see-through pixels inside the plate disc
 * and the badge corner each as one flat color, the crop's mean there (the art
 * composited over what shows through it). The flat areas keep the moving scene
 * out, while the composite makes a weapon answer for what it leaves uncovered:
 * the badge a base kit lacks, the plate between a thin weapon's parts, which
 * ink-colored art would otherwise claim. Near-tied top candidates are re-ranked
 * on the parts only one of them draws. Splatted slots grey their render out
 * and are skipped.
 */
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { getCV, type Mat } from "../../cv";
import * as Decisions from "../../decisions";
import { copyRoi, type FrameData } from "../../image";
import type { DetectedEvent } from "../types";
import type { PlayerStatusData, StripFit } from "./player-status";
import {
	STATUS_ICON_CENTER_Y,
	STATUS_REFERENCE_PITCH,
	STRIP_WEAPON_BADGE_CORNER,
	STRIP_WEAPON_CENTER_DY,
	STRIP_WEAPON_CROP_HALF,
	STRIP_WEAPON_ICON_SIZE,
	STRIP_WEAPON_MASK_MIN_ALPHA,
	STRIP_WEAPON_MIN_SCORE,
	STRIP_WEAPON_PLATE_RADIUS,
	STRIP_WEAPON_SEARCH,
	STRIP_WEAPON_SHORTLIST,
	STRIP_WEAPON_TIE_MARGIN,
	STRIP_WEAPON_TOP_K,
} from "./rois";

export const STRIP_WEAPONS_EVENT_TYPE = "StripWeapons";

interface StripWeaponCandidate {
	weaponId: MainWeaponId;
	score: number;
}

export interface StripWeaponsData {
	/** match timer at the read, pairing it with the Objective/PlayerStatus events */
	time: number | null;
	/** ranked candidates per slot, [left team, right team], as drawn; null = splatted or no render */
	slots: [(StripWeaponCandidate[] | null)[], (StripWeaponCandidate[] | null)[]];
}

/** One weapon's icon art, masked to its opaque pixels, at the full and half crop resolution. */
export interface StripWeaponTemplate {
	weaponId: MainWeaponId;
	fine: MaskedArt;
	coarse: MaskedArt;
	/** the icon at the full crop resolution, for telling near-tied candidates apart */
	canvas: ArtCanvas;
}

interface ArtCanvas {
	width: number;
	height: number;
	rgba: Uint8Array;
}

interface CropSize {
	width: number;
	height: number;
}

/** Offsets searched about the crop center, inclusive. */
interface SearchWindow {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

interface MaskedArt {
	/** per opaque pixel and channel: the RGB index offset from the crop's center pixel */
	offsets: Int32Array;
	/** the matching art values */
	values: Float32Array;
	valueSum: number;
	valueSumSquares: number;
	/**
	 * See-through pixels in the areas a flat color shows through (the plate
	 * disc, the badge corner), one group per area: each pixel's red channel
	 * index offset from the crop's center pixel
	 */
	flatGroups: Int32Array[];
}

const FINE_SIZE: CropSize = {
	width: 2 * STRIP_WEAPON_CROP_HALF.x,
	height: 2 * STRIP_WEAPON_CROP_HALF.y,
};
const COARSE_SIZE: CropSize = {
	width: STRIP_WEAPON_CROP_HALF.x,
	height: STRIP_WEAPON_CROP_HALF.y,
};
// the shortlist only needs the right weapon near the top: the horizontal
// wobble at half resolution, none vertically
const COARSE_SEARCH: SearchWindow = {
	left: -Math.ceil(STRIP_WEAPON_SEARCH.x / 2),
	right: Math.ceil(STRIP_WEAPON_SEARCH.x / 2),
	top: 0,
	bottom: 0,
};
// the full-resolution pass searches only about the shortlist pass's best
// offset: a half-resolution pixel and its rounding either way
const FINE_REFINE_X = 2;
// a difference pixel counts only with all four neighbors differing alike
const NEIGHBORS = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
] as const;

/** Match every alive slot's icon; `status` and `fit` (same frame) supply dead flags, centers and scale. */
export function parseStripWeapons(
	frame: Mat,
	t: number,
	status: PlayerStatusData,
	fit: StripFit,
	templates: StripWeaponTemplate[],
): DetectedEvent<StripWeaponsData> {
	const scores: number[] = [];
	const slots = fit.map((sideFit, side) =>
		sideFit.centers.map((cx, slot) => {
			if (status.dead[side as 0 | 1][slot]) return null;
			const candidates = matchSlot(frame, cx, sideFit.pitch, templates);
			if (candidates) scores.push(candidates[0]!.score);
			return candidates;
		}),
	) as StripWeaponsData["slots"];

	return {
		type: STRIP_WEAPONS_EVENT_TYPE,
		t,
		confidence: scores.length > 0 ? Math.max(...scores) : 0,
		data: {
			time: status.time,
			slots,
		},
	};
}

/** Masked icon art per main weapon (`icons`: the game's RGBA weapon icons, keyed by id). */
export function prepareStripWeaponTemplates(
	icons: { id: string; image: FrameData }[],
): StripWeaponTemplate[] {
	const cv = getCV();
	return icons.map(({ id, image }) => {
		const rgba = cv.matFromImageData(image as unknown as ImageData);
		const template = {
			weaponId: Number(id) as MainWeaponId,
			fine: maskedArt(rgba, STRIP_WEAPON_ICON_SIZE, FINE_SIZE, 1),
			coarse: maskedArt(rgba, STRIP_WEAPON_ICON_SIZE / 2, COARSE_SIZE, 1 / 2),
			canvas: artCanvas(rgba, STRIP_WEAPON_ICON_SIZE),
		};
		rgba.delete();
		return template;
	});
}

function matchSlot(
	frame: Mat,
	cx: number,
	pitch: number,
	templates: StripWeaponTemplate[],
): StripWeaponCandidate[] | null {
	const scale = pitch / STATUS_REFERENCE_PITCH;
	const halfWidth = Math.round(STRIP_WEAPON_CROP_HALF.x * scale);
	const halfHeight = Math.round(STRIP_WEAPON_CROP_HALF.y * scale);
	const cy = Math.round(STATUS_ICON_CENTER_Y + STRIP_WEAPON_CENTER_DY * scale);
	const crop = copyRoi(frame, {
		x: cx - halfWidth,
		y: cy - halfHeight,
		w: 2 * halfWidth,
		h: 2 * halfHeight,
	});
	const fine = resampledRgb(crop, FINE_SIZE);
	const coarse = resampledRgb(crop, COARSE_SIZE);
	crop.delete();

	const shortlist = templates
		.map((template) => ({
			template,
			match: bestNcc(coarse, COARSE_SIZE, template.coarse, COARSE_SEARCH),
		}))
		.sort((a, b) => b.match.score - a.match.score)
		.slice(0, STRIP_WEAPON_SHORTLIST);
	const ranked = shortlist
		.map(({ template, match }) => ({
			template,
			match: bestNcc(fine, FINE_SIZE, template.fine, {
				left: Math.max(-STRIP_WEAPON_SEARCH.x, 2 * match.x - FINE_REFINE_X),
				right: Math.min(STRIP_WEAPON_SEARCH.x, 2 * match.x + FINE_REFINE_X),
				top: -STRIP_WEAPON_SEARCH.y,
				bottom: STRIP_WEAPON_SEARCH.y,
			}),
		}))
		.sort((a, b) => b.match.score - a.match.score);
	if (
		Decisions.below(
			"objective/strip-weapons:STRIP_WEAPON_MIN_SCORE",
			ranked[0]!.match.score,
			STRIP_WEAPON_MIN_SCORE,
		)
	) {
		return null;
	}
	const candidates = ranked
		.slice(0, STRIP_WEAPON_TOP_K)
		.map(({ template, match }) => ({
			weaponId: template.weaponId,
			score: match.score,
		}));
	const [first, second] = ranked;
	if (
		second &&
		Decisions.atMost(
			"objective/strip-weapons:STRIP_WEAPON_TIE_MARGIN",
			first!.match.score - second.match.score,
			STRIP_WEAPON_TIE_MARGIN,
		) &&
		differenceScore(fine, second, first!) >
			differenceScore(fine, first!, second)
	) {
		// the runner-up draws what tells the two apart: it takes the top rank
		[candidates[0]!.weaponId, candidates[1]!.weaponId] = [
			candidates[1]!.weaponId,
			candidates[0]!.weaponId,
		];
	}
	return candidates;
}

/**
 * The composited art's best NCC over the search offsets about the crop center.
 * Each see-through area takes the color the crop shows there (per channel
 * mean), so whatever else shows there counts against the art.
 */
function bestNcc(
	pixels: Float32Array,
	size: CropSize,
	art: MaskedArt,
	search: SearchWindow,
): { score: number; x: number; y: number } {
	const { offsets, values, flatGroups, valueSum, valueSumSquares } = art;
	const opaqueCount = offsets.length;
	let count = opaqueCount;
	for (const group of flatGroups) count += 3 * group.length;
	const centerX = size.width >> 1;
	const centerY = size.height >> 1;
	const best = { score: -1, x: 0, y: 0 };
	for (let oy = search.top; oy <= search.bottom; oy++) {
		for (let ox = search.left; ox <= search.right; ox++) {
			const anchor = ((centerY + oy) * size.width + centerX + ox) * 3;
			let sum = 0;
			let sumSquares = 0;
			let dot = 0;
			for (let i = 0; i < opaqueCount; i++) {
				const value = pixels[anchor + offsets[i]!]!;
				sum += value;
				sumSquares += value * value;
				dot += value * values[i]!;
			}
			let artSum = valueSum;
			let artSumSquares = valueSumSquares;
			for (const group of flatGroups) {
				if (group.length === 0) continue;
				let red = 0;
				let green = 0;
				let blue = 0;
				for (const offset of group) {
					const at = anchor + offset;
					const r = pixels[at]!;
					const g = pixels[at + 1]!;
					const b = pixels[at + 2]!;
					red += r;
					green += g;
					blue += b;
					sumSquares += r * r + g * g + b * b;
				}
				const groupSum = red + green + blue;
				// flat at the mean color: the cross term and the art's squares coincide
				const groupSquares =
					(red * red + green * green + blue * blue) / group.length;
				sum += groupSum;
				dot += groupSquares;
				artSum += groupSum;
				artSumSquares += groupSquares;
			}
			const covariance = dot - (artSum * sum) / count;
			const artSpread = artSumSquares - (artSum * artSum) / count;
			const spread = sumSquares - (sum * sum) / count;
			const ncc = covariance / Math.sqrt(Math.max(artSpread * spread, 1e-6));
			if (ncc > best.score) {
				best.score = ncc;
				best.x = ox;
				best.y = oy;
			}
		}
	}
	return best;
}

interface RankedTemplate {
	template: StripWeaponTemplate;
	match: { x: number; y: number };
}

/**
 * NCC of `own`'s composited art against the fine crop at its best offset, over
 * only the pixels one of the two icons draws and the other leaves see-through,
 * well inside such an area (a badge, a scope; not the edges two renders of one
 * shape disagree on): the shared body, most of a sibling pair's icon, drowns
 * those parts in the full score. Each channel is centered on its own, so a
 * flat see-through area explains nothing there: it scores 0.
 */
function differenceScore(
	pixels: Float32Array,
	own: RankedTemplate,
	other: RankedTemplate,
): number {
	const a = own.template.canvas;
	const b = other.template.canvas;
	const centerX = (FINE_SIZE.width >> 1) + own.match.x;
	const centerY = (FINE_SIZE.height >> 1) + own.match.y;
	const halfWidth = Math.max(a.width, b.width) >> 1;
	const halfHeight = Math.max(a.height, b.height) >> 1;
	const cropValues: number[] = [];
	const artIndexes: number[] = [];
	for (let dy = -halfHeight; dy < halfHeight; dy++) {
		const y = centerY + dy;
		if (y < 0 || y >= FINE_SIZE.height) continue;
		for (let dx = -halfWidth; dx < halfWidth; dx++) {
			const x = centerX + dx;
			if (x < 0 || x >= FINE_SIZE.width) continue;
			const drawn = drawnByOneOnly(a, b, dx, dy);
			if (
				drawn === null ||
				NEIGHBORS.some(
					([nx, ny]) => drawnByOneOnly(a, b, dx + nx, dy + ny) !== drawn,
				)
			) {
				continue;
			}
			const at = (y * FINE_SIZE.width + x) * 3;
			cropValues.push(pixels[at]!, pixels[at + 1]!, pixels[at + 2]!);
			artIndexes.push(drawn === "own" ? canvasPixel(a, dx, dy)! : -1);
		}
	}
	const count = artIndexes.length;
	if (count === 0) return 0;
	let covariance = 0;
	let artSpread = 0;
	let spread = 0;
	for (let channel = 0; channel < 3; channel++) {
		let cropSum = 0;
		let artSum = 0;
		let flatSum = 0;
		let flatCount = 0;
		for (let i = 0; i < count; i++) {
			const art = artIndexes[i]!;
			const crop = cropValues[i * 3 + channel]!;
			cropSum += crop;
			if (art >= 0) {
				artSum += a.rgba[art + channel]!;
			} else {
				flatSum += crop;
				flatCount++;
			}
		}
		// see-through pixels take one flat color: what the crop shows there
		const flat = flatCount > 0 ? flatSum / flatCount : 0;
		const cropMean = cropSum / count;
		const artMean = (artSum + flat * flatCount) / count;
		for (let i = 0; i < count; i++) {
			const art = artIndexes[i]!;
			const crop = cropValues[i * 3 + channel]! - cropMean;
			const value = (art >= 0 ? a.rgba[art + channel]! : flat) - artMean;
			covariance += crop * value;
			artSpread += value * value;
			spread += crop * crop;
		}
	}
	return covariance / Math.sqrt(Math.max(artSpread * spread, 1e-6));
}

/** RGBA index of the canvas pixel at (dx, dy) from its center if opaque, -1 if see-through, null if partly transparent. */
function canvasPixel(canvas: ArtCanvas, dx: number, dy: number): number | null {
	const x = dx + (canvas.width >> 1);
	const y = dy + (canvas.height >> 1);
	if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return -1;
	const i = (y * canvas.width + x) * 4;
	const alpha = canvas.rgba[i + 3]!;
	if (alpha >= STRIP_WEAPON_MASK_MIN_ALPHA) return i;
	return alpha === 0 ? -1 : null;
}

/** Which of two icons alone draws the pixel at (dx, dy) from their centers, the other see-through there. */
function drawnByOneOnly(
	own: ArtCanvas,
	other: ArtCanvas,
	dx: number,
	dy: number,
): "own" | "other" | null {
	const ownPixel = canvasPixel(own, dx, dy);
	const otherPixel = canvasPixel(other, dx, dy);
	if (ownPixel === null || otherPixel === null) return null;
	if (ownPixel >= 0 && otherPixel < 0) return "own";
	if (ownPixel < 0 && otherPixel >= 0) return "other";
	return null;
}

function artCanvas(rgba: Mat, iconSize: number): ArtCanvas {
	const cv = getCV();
	const scaled = new cv.Mat();
	const width = Math.round(iconSize);
	const height = Math.round((rgba.rows * iconSize) / rgba.cols);
	cv.resize(rgba, scaled, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
	const canvas = { width, height, rgba: new Uint8Array(scaled.data) };
	scaled.delete();
	return canvas;
}

function resampledRgb(crop: Mat, size: CropSize): Float32Array {
	const cv = getCV();
	const resized = new cv.Mat();
	const { width, height } = size;
	cv.resize(crop, resized, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
	const { data } = resized;
	const rgb = new Float32Array(width * height * 3);
	for (let i = 0; i < width * height; i++) {
		rgb[i * 3] = data[i * 4]!;
		rgb[i * 3 + 1] = data[i * 4 + 1]!;
		rgb[i * 3 + 2] = data[i * 4 + 2]!;
	}
	resized.delete();
	return rgb;
}

function maskedArt(
	rgba: Mat,
	iconSize: number,
	cropSize: CropSize,
	scale: number,
): MaskedArt {
	const cv = getCV();
	const scaled = new cv.Mat();
	const width = Math.round(iconSize);
	const height = Math.round((rgba.rows * iconSize) / rgba.cols);
	cv.resize(rgba, scaled, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
	const { data } = scaled;
	const reachX = (cropSize.width >> 1) - 1;
	const reachY = (cropSize.height >> 1) - 1;
	const offsets: number[] = [];
	const values: number[] = [];
	const flatGroups: number[][] = [[], []];
	for (let y = 0; y < height; y++) {
		const dy = y - (height >> 1);
		for (let x = 0; x < width; x++) {
			const dx = x - (width >> 1);
			const i = (y * width + x) * 4;
			const outOfReach =
				Math.abs(dx) + STRIP_WEAPON_SEARCH.x > reachX ||
				Math.abs(dy) + STRIP_WEAPON_SEARCH.y > reachY;
			if (outOfReach) continue;
			const offset = (dy * cropSize.width + dx) * 3;
			if (data[i + 3]! < STRIP_WEAPON_MASK_MIN_ALPHA) {
				const group =
					data[i + 3] === 0 ? flatGroupOf(dx / scale, dy / scale) : null;
				if (group !== null) flatGroups[group]!.push(offset);
				continue;
			}
			for (let channel = 0; channel < 3; channel++) {
				offsets.push(offset + channel);
				values.push(data[i + channel]!);
			}
		}
	}
	scaled.delete();

	return {
		offsets: Int32Array.from(offsets),
		values: Float32Array.from(values),
		valueSum: values.reduce((sum, value) => sum + value, 0),
		valueSumSquares: values.reduce((sum, value) => sum + value * value, 0),
		flatGroups: flatGroups.map((group) => Int32Array.from(group)),
	};
}

/** Which flat area a see-through pixel (reference px from the icon center) lies in: 0 plate disc, 1 badge corner. */
function flatGroupOf(dx: number, dy: number): number | null {
	if (dx * dx + dy * dy <= STRIP_WEAPON_PLATE_RADIUS ** 2) return 0;
	const corner = STRIP_WEAPON_BADGE_CORNER;
	if (
		dx >= corner.left &&
		dx <= corner.right &&
		dy >= corner.top &&
		dy <= corner.bottom
	) {
		return 1;
	}
	return null;
}
