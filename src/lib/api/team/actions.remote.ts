import { notFoundIfFalsy, validatedForm } from '$lib/server/remote-functions';
import { createTeamSchema, editTeamSchema } from './schemas';
import * as TeamRepository from '$lib/server/db/repositories/team';
import { mySlugify } from '$lib/utils/urls';
import { m } from '$lib/paraglide/messages';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { bySlug, canCreateTeam } from './queries.remote';
import { requirePermission } from '$lib/modules/permissions/guards.server';

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

export const edit = validatedForm(editTeamSchema, async (data) => {
	const team = notFoundIfFalsy(await TeamRepository.findBySlug(data.slug));

	requirePermission(team, 'EDIT');

	const newCustomUrl = mySlugify(data.name);

	if (team.customUrl !== newCustomUrl && (await TeamRepository.findBySlug(newCustomUrl))) {
		return {
			errors: {
				name: m.team_forms_errors_duplicateName
			}
		};
	}

	const editedTeam = await TeamRepository.update(team.id, {
		...data,
		slug: newCustomUrl
	});

	await bySlug(data.slug).refresh();
	redirect(303, resolve('/t/[slug]', { slug: editedTeam.customUrl }));
});
