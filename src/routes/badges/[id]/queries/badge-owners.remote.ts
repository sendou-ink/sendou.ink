import { query } from '$app/server';
import { id } from '$lib/schemas';
import * as BadgeRepository from '$lib/server/db/repositories/badge';

export const badgeOwners = query(id, async (id) => {
	return BadgeRepository.findOwnersById(id);
});
