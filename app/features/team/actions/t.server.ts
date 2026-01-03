import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { parseFormData } from "~/form/parse.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { TEAM } from "../team-constants";
import { createTeamSchemaServer } from "../team-schemas.server";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();
	const result = await parseFormData({
		request,
		schema: createTeamSchemaServer,
	});

	// xxx: should not have to be repeated
	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	const teams = await TeamRepository.findAllUndisbanded();

	const currentTeamCount = teams.filter((team) =>
		team.members.some((m) => m.id === user.id),
	).length;
	const maxTeamCount = user.roles.includes("SUPPORTER")
		? TEAM.MAX_TEAM_COUNT_PATRON
		: TEAM.MAX_TEAM_COUNT_NON_PATRON;

	errorToastIfFalsy(
		currentTeamCount < maxTeamCount,
		"Already in max amount of teams",
	);

	const team = await TeamRepository.create({
		ownerUserId: user.id,
		name: data.name,
		isMainTeam: currentTeamCount === 0,
	});

	throw redirect(teamPage(team.customUrl));
};
