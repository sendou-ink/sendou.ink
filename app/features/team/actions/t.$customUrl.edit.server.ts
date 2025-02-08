import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import { isAdmin } from "~/permissions";
import {
	notFoundIfFalsy,
	parseRequestPayload,
	validate,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { TEAM_SEARCH_PAGE, mySlugify, teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { editTeamSchema, teamParamsSchema } from "../team-schemas.server";
import { isTeamManager, isTeamOwner } from "../team-utils";

export const action: ActionFunction = async ({ request, params }) => {
	const user = await requireUserId(request);
	const { customUrl } = teamParamsSchema.parse(params);

	const team = notFoundIfFalsy(await TeamRepository.findByCustomUrl(customUrl));

	validate(
		isTeamManager({ team, user }) || isAdmin(user),
		"You are not a team manager",
	);

	const data = await parseRequestPayload({
		request,
		schema: editTeamSchema,
	});

	switch (data._action) {
		case "DELETE": {
			validate(isTeamOwner({ team, user }), "You are not the team owner");

			await TeamRepository.del(team.id);

			throw redirect(TEAM_SEARCH_PAGE);
		}
		case "EDIT": {
			const newCustomUrl = mySlugify(data.name);
			const existingTeam = await TeamRepository.findByCustomUrl(newCustomUrl);

			validate(
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
