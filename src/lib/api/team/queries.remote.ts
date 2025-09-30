import { getRequestEvent, query } from '$app/server';
import { requireUser } from '$lib/server/auth/session';
import * as TeamRepository from '$lib/server/db/repositories/team';
import { teamSlug, type EditTeamData } from './schemas';
import { notFoundIfFalsy, type SchemaToDefaultValues } from '$lib/server/remote-functions';
import { canAddCustomizedColors } from '$lib/core/team';
import { requirePermission } from '$lib/modules/permissions/guards.server';
import z from 'zod';
import { err, ok } from 'neverthrow';
import { SHORT_NANOID_LENGTH } from '$lib/utils/id';
import { m } from '$lib/paraglide/messages';
import { extractLocaleFromRequest } from '$lib/paraglide/runtime';
import { TEAM } from '$lib/constants/team';

export const canCreateTeam = query(async () => {
	const user = await requireUser();

	const teams = await TeamRepository.findAllUndisbanded();

	const currentTeamCount = teams.filter((team) =>
		team.members.some((member) => member.id === user.id)
	).length;
	const maxTeamCount = user.roles.includes('SUPPORTER') ? 5 : 2;

	return currentTeamCount < maxTeamCount;
});

export const bySlug = query(teamSlug, async (slug) => {
	const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug));

	const results = await TeamRepository.findResultPlacementsById(team.id);

	return {
		team,
		css: canAddCustomizedColors(team) ? team.css : null,
		results: resultsMapped(results)
	};
});

function resultsMapped(results: TeamRepository.FindResultPlacementsById) {
	if (results.length === 0) {
		return null;
	}

	const firstPlaceResults = results.filter((result) => result.placement === 1);
	const secondPlaceResults = results.filter((result) => result.placement === 2);
	const thirdPlaceResults = results.filter((result) => result.placement === 3);

	return {
		count: results.length,
		placements: [
			{
				placement: 1,
				count: firstPlaceResults.length
			},
			{
				placement: 2,
				count: secondPlaceResults.length
			},
			{
				placement: 3,
				count: thirdPlaceResults.length
			}
		]
	};
}

export type BySlugData = Awaited<ReturnType<typeof bySlug>>;

export const resultsBySlug = query(teamSlug, async (slug) => {
	const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug));
	const results = await TeamRepository.findResultsById(team.id);

	return {
		results
	};
});

export const inviteCodeBySlug = query(teamSlug, async (slug) => {
	const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug, { includeInviteCode: true }));

	requirePermission(team, 'EDIT');

	return team.inviteCode!;
});

export const validateInviteCode = query(
	z.object({ inviteCode: z.string(), slug: teamSlug }),
	async ({ inviteCode, slug }) => {
		const user = await requireUser();
		const request = getRequestEvent().request;

		if (inviteCode.length !== SHORT_NANOID_LENGTH) {
			return err(m.team_validation_SHORT_CODE({ locale: extractLocaleFromRequest(request) }));
		}

		const team = notFoundIfFalsy(
			await TeamRepository.findBySlug(slug, { includeInviteCode: true })
		);

		if (team.inviteCode !== inviteCode) {
			return err(
				m.team_validation_INVITE_CODE_WRONG({ locale: extractLocaleFromRequest(request) })
			);
		}

		if (team.members.some((member) => member.id === user.id)) {
			return err(
				m.tournament_join_error_ALREADY_JOINED({ locale: extractLocaleFromRequest(request) })
			);
		}

		if (team.members.length >= TEAM.MAX_MEMBER_COUNT) {
			return err(m.team_validation_TEAM_FULL({ locale: extractLocaleFromRequest(request) }));
		}

		const userMemberOfTeamCount = (await TeamRepository.teamsByMemberUserId(user.id)).length;

		if (
			userMemberOfTeamCount >=
			(user.roles.includes('SUPPORTER')
				? TEAM.MAX_TEAM_COUNT_PATRON
				: TEAM.MAX_TEAM_COUNT_NON_PATRON)
		) {
			return err(
				m.team_validation_REACHED_TEAM_COUNT_LIMIT({ locale: extractLocaleFromRequest(request) })
			);
		}

		return ok({ teamId: team.id });
	}
);

export const editTeamFormData = query(
	teamSlug,
	async (slug): Promise<SchemaToDefaultValues<EditTeamData>> => {
		const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug));

		requirePermission(team, 'EDIT');

		return {
			slug: team.customUrl,
			name: team.name,
			bio: team.bio,
			tag: team.tag,
			bsky: team.bsky,
			banner: team.bannerSrc,
			logo: team.avatarSrc
		};
	}
);

/** Returns the teams the user is currently a member of */
export const myTeams = query(async () => {
	const user = await requireUser();
	return await TeamRepository.findAllMemberOfByUserId(user.id);
});
