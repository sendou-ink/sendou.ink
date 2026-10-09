/**
 * StripWeapons: per-slot weapon-icon evidence off the PlayerStatus icon strip,
 * sampled by the ObjectiveDetector. The strip keeps its own slot order (it can
 * change every game) while the results scoreboard re-sorts each team, so the
 * match builder aggregates these candidate lists into the slot→row assignment
 * (slot-row-assignment.ts). The strip fit pins each icon's center and scale, so
 * a slot is resampled to the reference pitch and scored against every weapon's
 * game icon at that one size, over the icon art's opaque pixels only (masked
 * NCC): the team-ink plate and the moving scene behind it never weigh in.
 * Splatted slots grey their render out and are skipped.
 */
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { getCV, type Mat } from "../../cv";
import { copyRoi, type FrameData } from "../../image";
import type { DetectedEvent } from "../types";
import type { PlayerStatusData, StripFit } from "./player-status";
import {
	STATUS_ICON_CENTER_Y,
	STATUS_REFERENCE_PITCH,
	STRIP_WEAPON_CENTER_DY,
	STRIP_WEAPON_CROP_HALF,
	STRIP_WEAPON_ICON_SIZE,
	STRIP_WEAPON_MASK_MIN_ALPHA,
	STRIP_WEAPON_MIN_SCORE,
	STRIP_WEAPON_SEARCH,
	STRIP_WEAPON_SHORTLIST,
	STRIP_WEAPON_TOP_K,
} from "./rois";

export const STRIP_WEAPONS_EVENT_TYPE = "StripWeapons";

export interface StripWeaponCandidate {
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
}

interface MaskedArt {
	/** per opaque pixel and channel: the RGB index offset from the crop's center pixel */
	offsets: Int32Array;
	/** the matching values, zero-mean and unit-norm */
	values: Float32Array;
}

const FINE_SIZE = 2 * STRIP_WEAPON_CROP_HALF;
const COARSE_SIZE = STRIP_WEAPON_CROP_HALF;
// the shortlist only needs the right weapon near the top: half the
// horizontal wobble at half resolution, none vertically
const COARSE_SEARCH = { x: Math.ceil(STRIP_WEAPON_SEARCH.x / 2), y: 0 };

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
			fine: maskedArt(rgba, STRIP_WEAPON_ICON_SIZE, FINE_SIZE),
			coarse: maskedArt(rgba, STRIP_WEAPON_ICON_SIZE / 2, COARSE_SIZE),
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
	const half = Math.round(STRIP_WEAPON_CROP_HALF * scale);
	const cy = Math.round(STATUS_ICON_CENTER_Y + STRIP_WEAPON_CENTER_DY * scale);
	const crop = copyRoi(frame, {
		x: cx - half,
		y: cy - half,
		w: 2 * half,
		h: 2 * half,
	});
	const fine = resampledRgb(crop, FINE_SIZE);
	const coarse = resampledRgb(crop, COARSE_SIZE);
	crop.delete();

	const shortlist = templates
		.map((template) => ({
			template,
			score: bestNcc(coarse, COARSE_SIZE, template.coarse, COARSE_SEARCH),
		}))
		.sort((a, b) => b.score - a.score)
		.slice(0, STRIP_WEAPON_SHORTLIST);
	const ranked = shortlist
		.map(({ template }) => ({
			weaponId: template.weaponId,
			score: bestNcc(fine, FINE_SIZE, template.fine, STRIP_WEAPON_SEARCH),
		}))
		.sort((a, b) => b.score - a.score);
	if (ranked[0]!.score < STRIP_WEAPON_MIN_SCORE) return null;
	return ranked.slice(0, STRIP_WEAPON_TOP_K);
}

/** The art's best NCC over the search offsets about the crop center. */
function bestNcc(
	pixels: Float32Array,
	size: number,
	art: MaskedArt,
	search: { x: number; y: number },
): number {
	const { offsets, values } = art;
	const n = offsets.length;
	const center = size >> 1;
	let best = -1;
	for (let oy = -search.y; oy <= search.y; oy++) {
		for (let ox = -search.x; ox <= search.x; ox++) {
			const anchor = ((center + oy) * size + center + ox) * 3;
			let sum = 0;
			let sumSquares = 0;
			let dot = 0;
			for (let i = 0; i < n; i++) {
				const value = pixels[anchor + offsets[i]!]!;
				sum += value;
				sumSquares += value * value;
				dot += value * values[i]!;
			}
			// the zero-mean template already cancels the patch mean out of `dot`
			const spread = Math.sqrt(Math.max(sumSquares - (sum * sum) / n, 1e-6));
			const ncc = dot / spread;
			if (ncc > best) best = ncc;
		}
	}
	return best;
}

function resampledRgb(crop: Mat, size: number): Float32Array {
	const cv = getCV();
	const resized = new cv.Mat();
	cv.resize(crop, resized, new cv.Size(size, size), 0, 0, cv.INTER_AREA);
	const { data } = resized;
	const rgb = new Float32Array(size * size * 3);
	for (let i = 0; i < size * size; i++) {
		rgb[i * 3] = data[i * 4]!;
		rgb[i * 3 + 1] = data[i * 4 + 1]!;
		rgb[i * 3 + 2] = data[i * 4 + 2]!;
	}
	resized.delete();
	return rgb;
}

function maskedArt(rgba: Mat, iconSize: number, cropSize: number): MaskedArt {
	const cv = getCV();
	const scaled = new cv.Mat();
	const width = Math.round(iconSize);
	const height = Math.round((rgba.rows * iconSize) / rgba.cols);
	cv.resize(rgba, scaled, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
	const { data } = scaled;
	const reach = (cropSize >> 1) - 1;
	const offsets: number[] = [];
	const values: number[] = [];
	for (let y = 0; y < height; y++) {
		const dy = y - (height >> 1);
		for (let x = 0; x < width; x++) {
			const dx = x - (width >> 1);
			const i = (y * width + x) * 4;
			const outOfReach =
				Math.abs(dx) + STRIP_WEAPON_SEARCH.x > reach ||
				Math.abs(dy) + STRIP_WEAPON_SEARCH.y > reach;
			if (data[i + 3]! < STRIP_WEAPON_MASK_MIN_ALPHA || outOfReach) continue;
			for (let channel = 0; channel < 3; channel++) {
				offsets.push((dy * cropSize + dx) * 3 + channel);
				values.push(data[i + channel]!);
			}
		}
	}
	scaled.delete();

	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	const centered = values.map((value) => value - mean);
	const norm = Math.sqrt(centered.reduce((sum, value) => sum + value ** 2, 0));
	return {
		offsets: Int32Array.from(offsets),
		values: Float32Array.from(centered, (value) => value / (norm || 1)),
	};
}
