/**
 * Ability badge templates for the death-screen gear panel.
 *
 * Committed icon assets (assets/cv/abilities/) are bare icon art with
 * alpha; on screen each sits centered on a near-black circular badge
 * filling a known fraction of the slot. Templates composite the art onto a
 * black square at that fraction, then resize to the candidate badge sizes —
 * shaped like weapon templates so matchWeapon's NCC + ink-coverage scoring
 * (see weapons.ts) applies directly. Mains (⌀~68) and subs (⌀~48) use
 * different art fractions, so each role gets its own template set.
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
 * Exported for the calibration tooling's art-ratio sweeps and for other
 * screens' badge sets (scoreboard-own builds its sizes/threshold here).
 * inkThreshold must match the one passed to matchWeapon, or the coverage
 * ratio compares mismatched ink counts.
 */
export function buildAbilityRole(
	icons: { id: string; image: FrameData }[],
	sizes: readonly number[],
	artRatio: number,
	inkThreshold: number = ABILITY_INK_THRESHOLD,
): WeaponTemplate[] {
	const cv = getCV();
	return icons.map(({ id, image }) => {
		// composite the icon art over the badge black, padded so the art
		// occupies artRatio of the square (as it does of the badge on screen)
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
