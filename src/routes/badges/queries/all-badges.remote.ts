import { prerender } from '$app/server';
import * as BadgeRepository from '$lib/server/db/repositories/badge';

export const allBadges = prerender(async () => {
	return await BadgeRepository.all();
});

export type AllBadgesQuery = Awaited<ReturnType<typeof allBadges>>;
