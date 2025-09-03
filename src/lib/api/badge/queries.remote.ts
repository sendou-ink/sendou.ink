import { query } from '$app/server';
import { requireUser } from '$lib/server/auth/session';
import * as BadgeRepository from '$lib/server/db/repositories/badge';

export const allBadgesManagedByMe = query(async () => {
	const loggedInUser = await requireUser();
	return await BadgeRepository.findManagedByUserId(loggedInUser.id);
});
