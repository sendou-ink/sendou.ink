import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { TEAM_SEARCH_PAGE, mySlugify, teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { editTeamSchema, teamParamsSchema } from "../team-schemas.server";
import { isTeamManager, isTeamOwner } from "../team-utils";

export const action: ActionFunction = async ({ request, params }) => {
	const user = await requireUser(request);
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
			const existingTeam = await TeamRepository.findByCustomUrl(newCustomUrl);

			errorToastIfFalsy(
				newCustomUrl.length > 0,
				"Team name can't be only special characters",
			);

			// can't take someone else's custom url
			if (existingTeam && existingTeam.id !== team.id) {
				return {
					errors: ["forms.errors.duplicateName"],
				};
			}

			const editedTeam = await TeamRepository.update({
				id: team.id,
				customUrl: newCustomUrl,
				...data,
			});

			throw redirect(teamPage(editedTeam.customUrl));
		}
		default: {
			assertUnreachable(data);
		}
	}
};
