import type { ActionFunctionArgs } from "@remix-run/node";
import { associationsPageActionSchema } from "~/features/associations/associations-schemas";
import { requireUserId } from "~/features/auth/core/user.server";
import { requirePermission } from "~/modules/permissions/requirePermission.server";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as AssociationRepository from "../AssociationRepository.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUserId(request);
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
		// xxx: make sure scrim post handles association related to it getting deleted
		case "DELETE_ASSOCIATION": {
			await validateHasManagePermissions({
				user,
				associationId: data.associationId,
			});

			await AssociationRepository.del(data.associationId);

			break;
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
		await AssociationRepository.findById(associationId),
	);

	requirePermission(association, "MANAGE", user);
}
