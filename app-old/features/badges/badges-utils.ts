import type { TFunction } from "i18next";
import { SPLATOON_3_XP_BADGE_VALUES } from "~/constants";
import type { Badge as BadgeDBType } from "~/db/types";

export function badgeExplanationText(
	t: TFunction<"badges", undefined>,
	badge: Pick<BadgeDBType, "displayName" | "code"> & { count?: number },
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
