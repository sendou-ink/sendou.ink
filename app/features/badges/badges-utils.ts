import type { TFunction } from "i18next";
import type { Tables } from "~/db/tables";
import { SPLATOON_3_XP_BADGE_VALUES } from "./badges-constants";

export function badgeExplanationText(
	t: TFunction<"badges", undefined>,
	badge: Pick<Tables["Badge"], "displayName" | "code"> & { count?: number },
) {
	if (badge.code === "patreon") return t("patreon");
	if (badge.code === "patreon_plus") {
		return t("patreon+");
	}
	if (
		badge.code.startsWith("xp") ||
		SPLATOON_3_XP_BADGE_VALUES.includes(Number(badge.code) as any)
	) {
		return t("xp", { xpText: badge.displayName });
	}

	return t("tournament", {
		count: badge.count ?? 1,
		tournament: badge.displayName,
	}).replace("&#39;", "'");
}

export const findSplatoon3XpBadgeValue = (xPower: number) => {
	for (const value of SPLATOON_3_XP_BADGE_VALUES) {
		if (xPower >= value) {
			return value;
		}
	}

	return null;
};
