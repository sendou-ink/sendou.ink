import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import type { MemberRole, MemberRoleType } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import { parseFormData } from "~/form/parse.server";
import { errorToastIfFalsy, notFoundIfFalsy } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { CUSTOM_ROLE_VALUE } from "../team-schemas";
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
			const existingMembersById = new Map(
				team.members.map((member) => [member.id, member]),
			);

			for (const member of data.members) {
				errorToastIfFalsy(
					existingMembersById.has(member.userId),
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
				members: data.members.map((member, index) => {
					const isCustom = member.role === CUSTOM_ROLE_VALUE;
					const existing = existingMembersById.get(member.userId);
					const isProtectedMember = Boolean(
						existing?.isOwner || existing?.id === user.id,
					);

					return {
						userId: member.userId,
						role: isCustom
							? null
							: ((member.role || null) as MemberRole | null),
						customRole: isCustom ? member.customRole || null : null,
						roleType: isCustom
							? ((member.roleType || null) as MemberRoleType | null)
							: null,
						isManager: isProtectedMember
							? Boolean(existing?.isManager)
							: member.isManager,
						order: index,
					};
				}),
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
