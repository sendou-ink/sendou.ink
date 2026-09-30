/**
 * Ability badge templates for the death-screen gear panel: the bare icon art
 * (assets/cv/abilities/) is composited onto a near-black square at the on-screen
 * art fraction and resized to candidate badge sizes, shaped like weapon templates
 * so matchWeapon's scoring applies. Mains (⌀~68) and subs (⌀~48) use different
 * art fractions, hence separate template sets.
 */
import { getCV } from "../../cv";
import type { FrameData } from "../../image";
import { buildTemplateSizes, type WeaponTemplate } from "../scoreboard/weapons";
import {
	ABILITY_INK_THRESHOLD,
	ABILITY_MAIN_ART_RATIO,
	ABILITY_MAIN_SIZES,
	ABILITY_SUB_ART_RATIO,
	ABILITY_SUB_SIZES,
} from "./rois";

/** Badge interior brightness (near-black circle on the dark panel). */
const BADGE_BACKGROUND = 10;

export interface AbilityTemplates {
	mains: WeaponTemplate[];
	subs: WeaponTemplate[];
}

/**
 * Also used by calibration art-ratio sweeps and scoreboard-own's badge set.
 * inkThreshold must match the one passed to matchWeapon or coverage ratios mismatch.
 */
export function buildAbilityRole(
	icons: { id: string; image: FrameData }[],
	sizes: readonly number[],
	artRatio: number,
	inkThreshold: number = ABILITY_INK_THRESHOLD,
): WeaponTemplate[] {
	const cv = getCV();
	return icons.map(({ id, image }) => {
		// pad so the art occupies artRatio of the square, as it does of the badge on screen
		const side = Math.round(image.width / artRatio);
		const offset = Math.floor((side - image.width) / 2);
		const padded = new cv.Mat(
			side,
			side,
			cv.CV_8UC3,
			new cv.Scalar(BADGE_BACKGROUND, BADGE_BACKGROUND, BADGE_BACKGROUND),
		);
		const dst = padded.data;
		const src = image.data;
		for (let y = 0; y < image.height; y++) {
			for (let x = 0; x < image.width; x++) {
				const si = (y * image.width + x) * 4;
				const a = src[si + 3]! / 255;
				const di = ((y + offset) * side + x + offset) * 3;
				dst[di] = Math.round(src[si]! * a + BADGE_BACKGROUND * (1 - a));
				dst[di + 1] = Math.round(src[si + 1]! * a + BADGE_BACKGROUND * (1 - a));
				dst[di + 2] = Math.round(src[si + 2]! * a + BADGE_BACKGROUND * (1 - a));
			}
		}
		const templateSizes = buildTemplateSizes(padded, sizes, inkThreshold);
		padded.delete();
		return { id, sizes: templateSizes };
	});
}

export function prepareAbilityTemplates(
	icons: { id: string; image: FrameData }[],
): AbilityTemplates {
	return {
		mains: buildAbilityRole(icons, ABILITY_MAIN_SIZES, ABILITY_MAIN_ART_RATIO),
		subs: buildAbilityRole(icons, ABILITY_SUB_SIZES, ABILITY_SUB_ART_RATIO),
	};
}
