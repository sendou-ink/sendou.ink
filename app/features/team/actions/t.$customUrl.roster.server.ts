import type { ActionFunction } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import { isAdmin } from "~/permissions";
import {
	notFoundIfFalsy,
	parseRequestPayload,
	validate,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as TeamMemberRepository from "../TeamMemberRepository.server";
import * as TeamRepository from "../TeamRepository.server";
import { manageRosterSchema, teamParamsSchema } from "../team-schemas.server";
import { isTeamManager } from "../team-utils";

export const action: ActionFunction = async ({ request, params }) => {
	const user = await requireUserId(request);

	const { customUrl } = teamParamsSchema.parse(params);
	const team = notFoundIfFalsy(await TeamRepository.findByCustomUrl(customUrl));
	validate(
		isTeamManager({ team, user }) || isAdmin(user),
		"Only team manager or owner can manage roster",
	);

	const data = await parseRequestPayload({
		request,
		schema: manageRosterSchema,
	});

	switch (data._action) {
		case "DELETE_MEMBER": {
			const member = team.members.find((m) => m.id === data.userId);

			validate(member, "Member not found");
			validate(member.id !== user.id, "Can't delete yourself");
			validate(!member.isOwner, "Can't delete owner");

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
		case "ADD_MANAGER": {
			await TeamMemberRepository.update(
				{ teamId: team.id, userId: data.userId },
				{
					isManager: 1,
				},
			);

			break;
		}
		case "REMOVE_MANAGER": {
			const member = team.members.find((m) => m.id === data.userId);
			validate(member, "Member not found");
			validate(member.id !== user.id, "Can't remove yourself as manager");

			await TeamMemberRepository.update(
				{ teamId: team.id, userId: data.userId },
				{
					isManager: 0,
				},
			);

			break;
		}
		case "UPDATE_MEMBER_ROLE": {
			await TeamMemberRepository.update(
				{ teamId: team.id, userId: data.userId },
				{
					role: data.role || null,
				},
			);

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
