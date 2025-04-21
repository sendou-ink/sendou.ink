import type { ActionFunctionArgs } from "@remix-run/node";
import { ASSOCIATION } from "~/features/associations/associations-constants";
import { associationsPageActionSchema } from "~/features/associations/associations-schemas";
import { requireUser } from "~/features/auth/core/user.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseRequestPayload,
	successToast,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { isAtLeastFiveDollarTierPatreon } from "~/utils/users";
import * as AssociationRepository from "../AssociationRepository.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: associationsPageActionSchema,
	});

	switch (data._action) {
		case "REMOVE_MEMBER": {
			await validateHasManagePermissions({
				user,
				associationId: data.associationId,
			});

			errorToastIfFalsy(
				data.userId !== user.id,
				"Cannot remove yourself from the association",
			);

			await AssociationRepository.removeMember({
				userId: data.userId,
				associationId: data.associationId,
			});

			break;
		}
		case "DELETE_ASSOCIATION": {
			await validateHasManagePermissions({
				user,
				associationId: data.associationId,
			});

			await AssociationRepository.del(data.associationId);

			break;
		}
		case "REFRESH_INVITE_CODE": {
			await validateHasManagePermissions({
				user,
				associationId: data.associationId,
			});

			await AssociationRepository.refreshInviteCode(data.associationId);

			return successToast("Invite code reset");
		}
		case "JOIN_ASSOCIATION": {
			const associationToJoin = badRequestIfFalsy(
				await AssociationRepository.findByInviteCode(data.inviteCode, {
					withMembers: true,
				}),
			);
			errorToastIfFalsy(
				associationToJoin.members?.every((member) => member.id !== user.id),
				"You are already a member of this association",
			);
			errorToastIfFalsy(
				associationToJoin.members!.length <
					ASSOCIATION.MAX_ASSOCIATION_MEMBER_COUNT,
				"Association is full",
			);

			const maxAssociationCount = isAtLeastFiveDollarTierPatreon(user)
				? ASSOCIATION.MAX_COUNT_SUPPORTER
				: ASSOCIATION.MAX_COUNT_REGULAR_USER;

			errorToastIfFalsy(
				(await AssociationRepository.findByMemberUserId(user.id)).actual
					.length < maxAssociationCount,
				`Regular users can only be a member of ${maxAssociationCount} associations (supporters ${ASSOCIATION.MAX_COUNT_SUPPORTER})`,
			);

			await AssociationRepository.addMember({
				userId: user.id,
				associationId: associationToJoin.id,
			});

			break;
		}
		case "LEAVE_ASSOCIATION": {
			const association = badRequestIfFalsy(
				await AssociationRepository.findById(data.associationId, {
					withMembers: true,
				}),
			);

			errorToastIfFalsy(
				!association.permissions.MANAGE.includes(user.id),
				"You cannot leave an association you manage",
			);

			await AssociationRepository.removeMember({
				userId: user.id,
				associationId: data.associationId,
			});

			return successToast("Left association");
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

async function validateHasManagePermissions({
	user,
	associationId,
}: { user: { id: number }; associationId: number }) {
	const association = badRequestIfFalsy(
		await AssociationRepository.findById(associationId, { withMembers: true }),
	);

	requirePermission(association, "MANAGE", user);
}
