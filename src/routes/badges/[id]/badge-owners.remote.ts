import { query } from '$app/server';
import { id } from '$lib/utils/zod';
import * as BadgeRepository from '$lib/server/db/repositories/badge';

export const badgeOwners = query(id, async (id) => {
	return BadgeRepository.findOwnersById(id);
});
