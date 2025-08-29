import { badRequestIfErr, notFoundIfFalsy, validatedForm } from '$lib/server/remote-functions';
import { createTeamSchema, editTeamSchema, teamSlug } from './schemas';
import * as TeamRepository from '$lib/server/db/repositories/team';
import { mySlugify } from '$lib/utils/urls';
import { m } from '$lib/paraglide/messages';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { bySlug, canCreateTeam, inviteCodeBySlug, validateInviteCode } from './queries.remote';
import { requirePermission } from '$lib/modules/permissions/guards.server';
import { command } from '$app/server';
import { requireUser } from '$lib/server/auth/session';
import z from 'zod';
import { TEAM, TEAM_MEMBER_ROLES } from '$lib/constants/team';
import { resolveNewOwner } from '$lib/core/team';
import { id } from '$lib/schemas';
import * as TeamMemberRepository from '$lib/server/db/repositories/team-member';

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

	bySlug(data.slug).refresh();
	redirect(303, resolve('/t/[slug]', { slug: editedTeam.customUrl }));
});

export const resetInviteCode = command(teamSlug, async (slug) => {
	const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug));
	requirePermission(team, 'EDIT');

	await TeamRepository.resetInviteCode(team.id);
	inviteCodeBySlug(slug).refresh();
});

export const joinTeam = command(
	z.object({ inviteCode: z.string(), slug: teamSlug }),
	async ({ inviteCode, slug }) => {
		const user = await requireUser();

		const { teamId } = badRequestIfErr(await validateInviteCode({ inviteCode, slug }));

		await TeamRepository.addNewTeamMember({
			maxTeamsAllowed: user.roles.includes('SUPPORTER')
				? TEAM.MAX_TEAM_COUNT_PATRON
				: TEAM.MAX_TEAM_COUNT_NON_PATRON,
			teamId,
			userId: user.id
		});

		bySlug(slug).refresh();
	}
);

export const deleteBySlug = command(teamSlug, async (slug) => {
	const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug));
	requirePermission(team, 'ADMIN');

	await TeamRepository.del(team.id);
	redirect(303, '/');
});

export const makeMainTeam = command(teamSlug, async (slug) => {
	const user = await requireUser();
	const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug));

	await TeamRepository.switchMainTeam({
		userId: user.id,
		teamId: team.id
	});
});

export const leave = command(teamSlug, async (slug) => {
	const user = await requireUser();
	const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug));

	const userIsOwner = team.members.find((m) => m.isOwner)?.id === user.id;

	const newOwner = userIsOwner ? resolveNewOwner(team.members) : null;

	if (userIsOwner && !newOwner) {
		error(
			400,
			"Can't leave the team if you are the owner and there is no other member to become the owner"
		);
	}

	await TeamRepository.handleMemberLeaving({
		teamId: team.id,
		userId: user.id,
		newOwnerUserId: newOwner?.id
	});

	bySlug(slug).refresh();
});

export const kick = command(z.object({ userId: id, slug: teamSlug }), async ({ userId, slug }) => {
	const user = await requireUser();
	const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug));
	requirePermission(team, 'EDIT');

	const member = team.members.find((m) => m.id === userId);

	if (!member) error(400, 'Member not found');
	if (userId === user.id) error(400, "Can't kick yourself");
	if (member.isOwner) error(400, "Can't kick the owner");

	await TeamRepository.handleMemberLeaving({
		teamId: team.id,
		userId
	});

	bySlug(slug).refresh();
});

export const updateTeamMember = command(
	z.object({
		userId: id,
		slug: teamSlug,
		delta: z
			.object({ isManager: z.boolean(), role: z.enum(TEAM_MEMBER_ROLES).nullable() })
			.partial()
	}),
	async ({ userId, slug, delta }) => {
		const user = await requireUser();
		const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug));
		requirePermission(team, 'EDIT');

		if (typeof delta.isManager === 'boolean' && userId === user.id) {
			error(400, "Can't change your own manager status");
		}

		await TeamMemberRepository.update(
			{
				teamId: team.id,
				userId
			},
			delta
		);

		bySlug(slug).refresh();
	}
);
