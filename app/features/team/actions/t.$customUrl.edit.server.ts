import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { mySlugify, TEAM_SEARCH_PAGE, teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { editTeamSchema, teamParamsSchema } from "../team-schemas.server";
import { isTeamManager, isTeamOwner } from "../team-utils";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();
	const { customUrl } = teamParamsSchema.parse(params);

	const team = notFoundIfFalsy(await TeamRepository.findByCustomUrl(customUrl));

	errorToastIfFalsy(
		isTeamManager({ team, user }) || user.roles.includes("ADMIN"),
		"You are not a team manager",
	);

	const data = await parseRequestPayload({
		request,
		schema: editTeamSchema,
	});

	if (data._action.includes("DELETE")) {
		errorToastIfFalsy(
			isTeamOwner({ team, user }),
			"You are not the team owner",
		);
	}

	switch (data._action) {
		case "DELETE_TEAM": {
			await TeamRepository.del(team.id);
			throw redirect(TEAM_SEARCH_PAGE);
		}
		case "DELETE_AVATAR": {
			await TeamRepository.removeTeamImage(team.id, "avatar");
			throw redirect(teamPage(team.customUrl));
		}
		case "DELETE_BANNER": {
			await TeamRepository.removeTeamImage(team.id, "banner");
			throw redirect(teamPage(team.customUrl));
		}
		case "EDIT": {
			const newCustomUrl = mySlugify(data.name);

			errorToastIfFalsy(
				newCustomUrl.length > 0,
				"Team name can't be only special characters",
			);

			const teams = await TeamRepository.findAllUndisbanded();
			const duplicateTeam = teams.find(
				(t) => t.customUrl === newCustomUrl && t.customUrl !== team.customUrl,
			);

			if (duplicateTeam) {
				return { errors: ["forms:errors.duplicateName"] };
			}

			const updatedTeam = await TeamRepository.update({
				id: team.id,
				...data,
			});

			throw redirect(teamPage(updatedTeam.customUrl));
		}
		default: {
			assertUnreachable(data);
		}
	}
};
