import type { ActionFunctionArgs } from "react-router";
import { ASSOCIATION } from "~/features/associations/associations-constants";
import { associationsPageActionSchema } from "~/features/associations/associations-schemas";
import * as Association from "~/features/associations/core/Association";
import { requireUser } from "~/features/auth/core/user.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseRequestPayload,
	successToast,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as AssociationRepository from "../AssociationRepository.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: associationsPageActionSchema,
	});

	switch (data._action) {
		case "REMOVE_MEMBER": {
			const association = await findAssociation(data.associationId);
			const memberToRemove = badRequestIfFalsy(
				association.members!.find((member) => member.id === data.userId),
			);

			requirePermission(memberToRemove, "REMOVE");

			await AssociationRepository.deleteMember({
				userId: data.userId,
				associationId: data.associationId,
			});

			break;
		}
		case "ADD_MANAGER":
		case "REMOVE_MANAGER": {
			const association = await requireAssociationPermission(
				data.associationId,
				"MANAGE",
			);

			errorToastIfFalsy(
				association.members!.some(
					(member) => member.id === data.userId && member.role !== "ADMIN",
				),
				"Not a member of the association",
			);

			await AssociationRepository.updateMemberRole({
				associationId: data.associationId,
				userId: data.userId,
				role: data._action === "ADD_MANAGER" ? "MANAGER" : "MEMBER",
			});

			break;
		}
		case "DELETE_ASSOCIATION": {
			await requireAssociationPermission(data.associationId, "MANAGE");

			await AssociationRepository.deleteById(data.associationId);

			break;
		}
		case "REFRESH_INVITE_CODE": {
			await requireAssociationPermission(
				data.associationId,
				"MANAGE_INVITE_LINK",
			);

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

			const maxAssociationCount = user.roles.includes("SUPPORTER")
				? ASSOCIATION.MAX_COUNT_SUPPORTER
				: ASSOCIATION.MAX_COUNT_REGULAR_USER;

			errorToastIfFalsy(
				(await AssociationRepository.findByMemberUserId(user.id)).actual
					.length < maxAssociationCount,
				`Regular users can only be a member of ${maxAssociationCount} associations (supporters ${ASSOCIATION.MAX_COUNT_SUPPORTER})`,
			);

			await AssociationRepository.insertMember({
				userId: user.id,
				associationId: associationToJoin.id,
			});

			break;
		}
		case "LEAVE_ASSOCIATION": {
			const association = await findAssociation(data.associationId);

			const isAdmin = association.permissions.MANAGE.includes(user.id);
			const newAdmin = isAdmin
				? Association.resolveNewAdmin(association.members!)
				: null;

			errorToastIfFalsy(
				!isAdmin || newAdmin,
				"You cannot leave an association you manage without a starred member to take over",
			);

			await AssociationRepository.handleMemberLeaving({
				userId: user.id,
				associationId: data.associationId,
				newAdminUserId: newAdmin?.id,
			});

			return successToast("Left association");
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

async function findAssociation(associationId: number) {
	return badRequestIfFalsy(
		await AssociationRepository.findById(associationId, { withMembers: true }),
	);
}

async function requireAssociationPermission(
	associationId: number,
	permission: "MANAGE" | "MANAGE_INVITE_LINK",
) {
	const association = await findAssociation(associationId);

	requirePermission(association, permission);

	return association;
}
