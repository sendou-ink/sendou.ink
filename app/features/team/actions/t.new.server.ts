import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { TEAM } from "../team-constants";
import { createTeamSchemaServer } from "../team-schemas.server";

export const action = defineAction(
	{ body: createTeamSchemaServer },
	async ({ body }) => {
		const user = requireUser();

		const currentTeamCount = (
			await TeamRepository.findAllMemberOfByUserId(user.id)
		).length;
		const maxTeamCount = user.roles.includes("SUPPORTER")
			? TEAM.MAX_TEAM_COUNT_PATRON
			: TEAM.MAX_TEAM_COUNT_NON_PATRON;

		errorToastIfFalsy(
			currentTeamCount < maxTeamCount,
			"Already in max amount of teams",
		);

		const team = await TeamRepository.insert({
			ownerUserId: user.id,
			name: body.name,
			isMainTeam: currentTeamCount === 0,
		});

		throw redirect(teamPage(team.customUrl));
	},
);
