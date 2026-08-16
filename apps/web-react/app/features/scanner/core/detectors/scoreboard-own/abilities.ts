/**
 * Ability badge templates for the personal-results gear cards. Same
 * composite-and-resize pipeline as the death panel (death/abilities.ts),
 * at this screen's smaller badge sizes and its gray-strip ink threshold.
 */
import type { FrameData } from "../../image";
import { type AbilityTemplates, buildAbilityRole } from "../death/abilities";
import {
	OWN_ABILITY_ART_RATIO,
	OWN_ABILITY_INK_THRESHOLD,
	OWN_ABILITY_MAIN_SIZES,
	OWN_ABILITY_SUB_SIZES,
} from "./rois";

export function prepareOwnAbilityTemplates(
	icons: { id: string; image: FrameData }[],
): AbilityTemplates {
	return {
		mains: buildAbilityRole(
			icons,
			OWN_ABILITY_MAIN_SIZES,
			OWN_ABILITY_ART_RATIO,
			OWN_ABILITY_INK_THRESHOLD,
		),
		subs: buildAbilityRole(
			icons,
			OWN_ABILITY_SUB_SIZES,
			OWN_ABILITY_ART_RATIO,
			OWN_ABILITY_INK_THRESHOLD,
		),
	};
}
