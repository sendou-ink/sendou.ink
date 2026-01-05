import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import type { MemberRole, MemberRoleType } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { teamPage } from "~/utils/urls";
import * as TeamMemberRepository from "../TeamMemberRepository.server";
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

	const data = await parseRequestPayload({
		request,
		schema: manageRosterSchema,
	});

	switch (data._action) {
		case "DELETE_MEMBER": {
			const member = team.members.find((m) => m.id === data.userId);

			errorToastIfFalsy(member, "Member not found");
			errorToastIfFalsy(member.id !== user.id, "Can't delete yourself");
			errorToastIfFalsy(!member.isOwner, "Can't delete owner");

			await TeamRepository.handleMemberLeaving({
				teamId: team.id,
				userId: data.userId,
			});
			break;
		}
		case "RESET_INVITE_LINK": {
			await TeamRepository.resetInviteCode(team.id);

			break;
		}
		case "BULK_UPDATE_ROSTER": {
			// xxx: after proper zod types, simplify
			const members = JSON.parse(data.members) as Array<{
				userId: number;
				role: MemberRole | "";
				customRole: string;
				roleType: MemberRoleType | "";
				isManager: boolean;
			}>;

			const membersForDb = members.map((m) => ({
				userId: m.userId,
				role: m.role || null,
				customRole: m.customRole || null,
				roleType: m.roleType || null,
				isManager: m.isManager,
			}));

			await TeamMemberRepository.bulkUpdateRoster(team.id, membersForDb);

			return redirect(teamPage(team.customUrl));
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
