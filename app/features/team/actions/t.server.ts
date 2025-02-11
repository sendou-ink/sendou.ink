import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { parseRequestPayload, validate } from "~/utils/remix.server";
import { mySlugify, teamPage } from "~/utils/urls";
import { isAtLeastFiveDollarTierPatreon } from "~/utils/users";
import * as TeamRepository from "../TeamRepository.server";
import { TEAM } from "../team-constants";
import { createTeamSchema } from "../team-schemas.server";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: createTeamSchema,
	});

	const teams = await TeamRepository.findAllUndisbanded();

	const teamMemberOfCount = teams.filter((team) =>
		team.members.some((m) => m.id === user.id),
	).length;
	const maxMemberCount = isAtLeastFiveDollarTierPatreon(user)
		? TEAM.MAX_TEAM_COUNT_PATRON
		: TEAM.MAX_TEAM_COUNT_NON_PATRON;

	validate(
		teamMemberOfCount < maxMemberCount,
		"Already in max amount of teams",
	);

	// two teams can't have same customUrl
	const customUrl = mySlugify(data.name);

	validate(customUrl.length > 0, "Team name can't be only special characters");

	if (teams.some((team) => team.customUrl === customUrl)) {
		return {
			errors: ["forms.errors.duplicateName"],
		};
	}

	await TeamRepository.create({
		ownerUserId: user.id,
		name: data.name,
		customUrl,
		isMainTeam: teamMemberOfCount === 0,
	});

	throw redirect(teamPage(customUrl));
};
