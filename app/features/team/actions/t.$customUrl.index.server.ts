import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import {
	errorToastIfFalsy,
	notFoundIfNullish,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as TeamRepository from "../TeamRepository.server";
import { teamProfilePageActionSchema } from "../team-schemas";
import { teamParamsSchema } from "../team-schemas.server";
import { isTeamMember, isTeamOwner, resolveNewOwner } from "../team-utils";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: teamProfilePageActionSchema,
	});

	const { customUrl } = v.parse(teamParamsSchema, params);
	const team = notFoundIfNullish(
		await TeamRepository.findByCustomUrl(customUrl),
	);

	switch (data._action) {
		case "LEAVE_TEAM": {
			errorToastIfFalsy(
				isTeamMember({ user, team }),
				"You are not a member of this team",
			);

			const newOwner = isTeamOwner({ user, team })
				? resolveNewOwner(team.members)
				: null;
			errorToastIfFalsy(
				!isTeamOwner({ user, team }) || newOwner,
				"You can't leave the team if you are the owner and there is no other member to become the owner",
			);

			await TeamRepository.handleMemberLeaving({
				teamId: team.id,
				userId: user.id,
				newOwnerUserId: newOwner?.id,
			});

			break;
		}
		case "MAKE_MAIN_TEAM": {
			await TeamRepository.switchOwnMainTeam(team.id);

			break;
		}
		case "DELETE_TEAM": {
			requirePermission(team, "DELETE");

			await TeamRepository.deleteById(team.id);
			throw redirect("/");
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
