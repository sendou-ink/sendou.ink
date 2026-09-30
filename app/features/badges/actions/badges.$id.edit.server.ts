import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import * as v from "valibot";
import { notify } from "~/features/notifications/core/notify.server";
import {
	requirePermission,
	requireRole,
} from "~/modules/permissions/guards.server";
import { diff } from "~/utils/arrays";
import { notFoundIfNullish, parseRequestPayload } from "~/utils/remix.server";
import { actualNumber, preprocess } from "~/utils/schema";
import { assertUnreachable } from "~/utils/types";
import { badgePage } from "~/utils/urls";
import * as BadgeRepository from "../BadgeRepository.server";
import { editBadgeActionSchema } from "../badges-schemas";

export const action: ActionFunction = async ({ request, params }) => {
	const data = await parseRequestPayload({
		request,
		schema: editBadgeActionSchema,
	});
	const badgeId = v.parse(preprocess(actualNumber, v.number()), params.id);
	const badge = notFoundIfNullish(await BadgeRepository.findById(badgeId));

	switch (data._action) {
		case "MANAGERS": {
			requireRole("STAFF");

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
			requirePermission(badge, "MANAGE");

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
