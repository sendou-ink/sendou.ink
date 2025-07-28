import { prerender } from '$app/server';
import { getUser, type AuthenticatedUser } from '$lib/server/auth/session';
import * as BadgeRepository from '$lib/server/db/repositories/badge';

export const allBadges = prerender(async () => {
	const user = await getUser();
	return splitBadges(await BadgeRepository.all(), user);
});

function splitBadges(
	badges: Awaited<ReturnType<typeof BadgeRepository.all>>,
	currentUser?: AuthenticatedUser
) {
	const ownBadges: typeof badges = [];
	const otherBadges: typeof badges = [];

	if (!currentUser) {
		return { own: ownBadges, other: badges };
	}

	for (const badge of badges) {
		if (badge.permissions.MANAGE.includes(currentUser.id)) {
			ownBadges.push(badge);
		} else {
			otherBadges.push(badge);
		}
	}

	return { own: ownBadges, other: otherBadges };
}
