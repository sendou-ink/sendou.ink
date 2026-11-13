import { useTranslation } from "react-i18next";
import type { Tables } from "~/db/tables";
import { assertUnreachable } from "~/utils/types";
import * as BadgeOrigin from "../core/BadgeOrigin";

/** What the badge was awarded for, e.g. "Awarded for winning In The Zone 30 (×2)". */
export function BadgeExplanation({
	badge,
}: {
	badge: Pick<Tables["Badge"], "displayName" | "code"> & { count?: number };
}) {
	const { t } = useTranslation("badges");

	const awardedFor = BadgeOrigin.awardedFor(badge);
	switch (awardedFor) {
		case "PATRON":
			return t("patreon");
		case "PATRON_PLUS":
			return t("patreon+");
		case "XP":
			return t("xp", { xpText: badge.displayName });
		case "TOURNAMENT":
			return t("tournament", {
				count: badge.count ?? 1,
				tournament: badge.displayName,
			}).replace("&#39;", "'");
		default:
			assertUnreachable(awardedFor);
	}
}
