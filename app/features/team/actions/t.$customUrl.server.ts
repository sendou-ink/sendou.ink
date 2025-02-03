import type { ActionFunction } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import {
	notFoundIfFalsy,
	parseRequestPayload,
	validate,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as TeamRepository from "../TeamRepository.server";
import {
	teamParamsSchema,
	teamProfilePageActionSchema,
} from "../team-schemas.server";
import { isTeamMember, isTeamOwner } from "../team-utils";

export const action: ActionFunction = async ({ request, params }) => {
	const user = await requireUserId(request);
	const data = await parseRequestPayload({
		request,
		schema: teamProfilePageActionSchema,
	});

	const { customUrl } = teamParamsSchema.parse(params);
	const team = notFoundIfFalsy(await TeamRepository.findByCustomUrl(customUrl));

	// xxx: handle owner leaving
	switch (data._action) {
		case "LEAVE_TEAM": {
			validate(
				isTeamMember({ user, team }) && !isTeamOwner({ user, team }),
				"You are not a regular member of this team",
			);

			await TeamRepository.removeTeamMember({
				teamId: team.id,
				userId: user.id,
			});

			break;
		}
		case "MAKE_MAIN_TEAM": {
			await TeamRepository.switchMainTeam({
				userId: user.id,
				teamId: team.id,
			});

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
