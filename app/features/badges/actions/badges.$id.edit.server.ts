import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import {
	requirePermission,
	requireRole,
} from "~/modules/permissions/guards.server";
import { diff } from "~/utils/arrays";
import { notFoundIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { badgePage } from "~/utils/urls";
import { actualNumber } from "~/utils/zod";
import * as BadgeRepository from "../BadgeRepository.server";
import { editBadgeActionSchema } from "../badges-schemas.server";

export const action: ActionFunction = async ({ request, params }) => {
	const data = await parseRequestPayload({
		request,
		schema: editBadgeActionSchema,
	});
	const badgeId = z.preprocess(actualNumber, z.number()).parse(params.id);
	const user = await requireUser(request);

	const badge = notFoundIfFalsy(await BadgeRepository.findById(badgeId));

	switch (data._action) {
		case "MANAGERS": {
			requireRole(user, "STAFF");

			const oldManagers = badge.managers;

			await BadgeRepository.replaceManagers({
				badgeId,
				managerIds: data.managerIds,
			});

			const newManagers = data.managerIds.filter(
				(newManagerId) =>
					!oldManagers.some((oldManager) => oldManager.userId === newManagerId),
			);

			notify({
				userIds: newManagers,
				notification: {
					type: "BADGE_MANAGER_ADDED",
					meta: {
						badgeId,
						badgeName: badge.displayName,
					},
				},
			});
			break;
		}
		case "OWNERS": {
			requirePermission(badge, "MANAGE", user);

			const oldOwners: number[] = badge.owners.flatMap((owner) =>
				new Array(owner.count).fill(owner.id),
			);

			await BadgeRepository.replaceOwners({ badgeId, ownerIds: data.ownerIds });

			notify({
				userIds: diff(oldOwners, data.ownerIds),
				notification: {
					type: "BADGE_ADDED",
					meta: {
						badgeName: badge.displayName,
						badgeId,
					},
				},
			});

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	throw redirect(badgePage(badgeId));
};
