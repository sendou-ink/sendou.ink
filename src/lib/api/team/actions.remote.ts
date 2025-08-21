import { validatedForm } from '$lib/server/remote-functions';
import { createTeamSchema } from './schemas';
import * as TeamRepository from '$lib/server/db/repositories/team';
import { mySlugify } from '$lib/utils/urls';
import { m } from '$lib/paraglide/messages';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { canCreateTeam } from './queries.remote';

export const create = validatedForm(createTeamSchema, async (data, user) => {
	if (!(await canCreateTeam())) error(400);

	const customUrl = mySlugify(data.name);

	if (await TeamRepository.findBySlug(customUrl)) {
		return {
			errors: {
				name: m.team_forms_errors_duplicateName
			}
		};
	}

	await TeamRepository.create({
		ownerUserId: user.id,
		name: data.name,
		customUrl
	});

	redirect(303, resolve('/t/[slug]', { slug: customUrl }));
});
