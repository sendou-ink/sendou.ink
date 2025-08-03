import { SPLATOON_3_XP_BADGE_VALUES } from '$lib/constants/common';
import { m } from '$lib/paraglide/messages';
import type { Tables } from '$lib/server/db/tables';

export function badgeExplanationText(
	badge: Pick<Tables['Badge'], 'displayName' | 'code'> & { count?: number }
) {
	if (badge.code === 'patreon') return m.badges_patreon();
	if (badge.code === 'patreon_plus') {
		return m['badges_patreon+']();
	}
	if (
		badge.code.startsWith('xp') ||
		SPLATOON_3_XP_BADGE_VALUES.includes(Number(badge.code) as any)
	) {
		return m.badges_xp({
			xpText: badge.displayName
		});
	}

	// xxx: plural
	return m
		.badges_tournament_one({
			// count: badge.count ?? 1,
			tournament: badge.displayName
		})
		.replace('&#39;', "'");
}

export function findSplatoon3XpBadgeValue(xPower: number) {
	for (const value of SPLATOON_3_XP_BADGE_VALUES) {
		if (xPower >= value) {
			return value;
		}
	}

	return null;
}
