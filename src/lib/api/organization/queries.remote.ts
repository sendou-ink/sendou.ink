import { query } from '$app/server';
import { requireUser } from '$lib/server/auth/session';
import * as TournamentOrganizationRepository from '$lib/server/db/repositories/organization';

export const byLoggedInUserOrganizerOf = query(async () => {
	const user = await requireUser();
	return await TournamentOrganizationRepository.findByOrganizerUserId(user.id);
});
