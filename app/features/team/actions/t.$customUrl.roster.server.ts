import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { parseFormData } from "~/form/parse.server";
import { errorToastIfFalsy, notFoundIfFalsy } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { manageRosterSchema, teamParamsSchema } from "../team-schemas.server";
import { isTeamManager } from "../team-utils";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();

	const { customUrl } = teamParamsSchema.parse(params);
	const team = notFoundIfFalsy(await TeamRepository.findByCustomUrl(customUrl));
	errorToastIfFalsy(
		isTeamManager({ team, user }) || user.roles.includes("ADMIN"),
		"Only team manager or owner can manage roster",
	);

	const result = await parseFormData({
		request,
		schema: manageRosterSchema,
	});
	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}
	const data = result.data;

	switch (data._action) {
		case "RESET_INVITE_LINK": {
			await TeamRepository.resetInviteCode(team.id);

			break;
		}
		case "UPDATE_ROSTER": {
			const submittedIds = new Set(data.members.map((m) => m.userId));

			for (const member of data.members) {
				errorToastIfFalsy(
					team.members.some((m) => m.id === member.userId),
					"Member not found",
				);
			}

			const kickedUserIds = team.members
				.filter((member) => !submittedIds.has(member.id))
				.map((member) => {
					errorToastIfFalsy(!member.isOwner, "Can't kick the owner");
					errorToastIfFalsy(member.id !== user.id, "Can't kick yourself");
					return member.id;
				});

			await TeamRepository.updateRoster({
				teamId: team.id,
				members: data.members.map((member) => ({
					userId: member.userId,
					role: member.role || null,
					isManager: member.isManager,
				})),
				kickedUserIds,
			});

			return redirect(teamPage(customUrl));
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
