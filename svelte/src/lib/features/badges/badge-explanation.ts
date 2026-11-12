import { SPLATOON_3_XP_BADGE_VALUES } from "~/features/badges/badges-constants";
import { m } from "#lib/paraglide/messages.js";

/** What a badge was awarded for, the Svelte twin of `badgeExplanationText`. */
export function badgeExplanationText(badge: {
	displayName: string;
	code: string;
	count?: number;
}) {
	if (badge.code === "patreon") return m.badges_patreon();
	if (badge.code === "patreon_plus") return m.badges_patreon_();
	if (
		badge.code.startsWith("xp") ||
		SPLATOON_3_XP_BADGE_VALUES.includes(Number(badge.code) as never)
	) {
		return m.badges_xp({ xpText: badge.displayName });
	}

	const count = badge.count ?? 1;
	return count === 1
		? m.badges_tournament_one({ tournament: badge.displayName })
		: m.badges_tournament_other({ tournament: badge.displayName, count });
}
