/** Ability badge templates at the minimap cards' badge size (⌀~44, mains only: cards show no subs). */
import type { FrameData } from "../../image";
import { buildAbilityRole } from "../death/abilities";
import type { WeaponTemplate } from "../scoreboard/weapons";
import {
	BADGE_ART_RATIO,
	BADGE_TEMPLATE_SIZES,
	MINIMAP_ABILITY_INK_THRESHOLD,
} from "./rois";

export function prepareMinimapAbilityTemplates(
	icons: { id: string; image: FrameData }[],
): WeaponTemplate[] {
	return buildAbilityRole(
		icons,
		BADGE_TEMPLATE_SIZES,
		BADGE_ART_RATIO,
		MINIMAP_ABILITY_INK_THRESHOLD,
	);
}
