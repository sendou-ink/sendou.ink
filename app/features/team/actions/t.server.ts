import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
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

	const currentTeamCount = teams.filter((team) =>
		team.members.some((m) => m.id === user.id),
	).length;
	const maxTeamCount = isAtLeastFiveDollarTierPatreon(user)
		? TEAM.MAX_TEAM_COUNT_PATRON
		: TEAM.MAX_TEAM_COUNT_NON_PATRON;

	errorToastIfFalsy(
		currentTeamCount < maxTeamCount,
		"Already in max amount of teams",
	);

	// two teams can't have same customUrl
	const customUrl = mySlugify(data.name);

	errorToastIfFalsy(
		customUrl.length > 0,
		"Team name can't be only special characters",
	);

	if (teams.some((team) => team.customUrl === customUrl)) {
		return {
			errors: ["forms.errors.duplicateName"],
		};
	}

	await TeamRepository.create({
		ownerUserId: user.id,
		name: data.name,
		customUrl,
		isMainTeam: currentTeamCount === 0,
	});

	throw redirect(teamPage(customUrl));
};
