import { redirect } from "react-router";
import { notify } from "~/features/notifications/core/notify.server";
import { defineAction } from "~/form/define-action.server";
import {
	requirePermission,
	requireRole,
} from "~/modules/permissions/guards.server";
import { diff } from "~/utils/arrays";
import { notFoundIfNullish } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { assertUnreachable } from "~/utils/types";
import { badgePage } from "~/utils/urls";
import * as BadgeRepository from "../BadgeRepository.server";
import { editBadgeActionSchema } from "../badges-schemas";

export const action = defineAction(
	{ params: idObject, body: editBadgeActionSchema },
	async ({ params: { id: badgeId }, body }) => {
		const badge = notFoundIfNullish(await BadgeRepository.findById(badgeId));

		switch (body._action) {
			case "MANAGERS": {
				requireRole("STAFF");

				const oldManagers = badge.managers;

				await BadgeRepository.replaceManagers({
					badgeId,
					managerIds: body.managerIds,
				});

				const newManagers = body.managerIds.filter(
					(newManagerId) =>
						!oldManagers.some(
							(oldManager) => oldManager.userId === newManagerId,
						),
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

				await BadgeRepository.replaceOwners({
					badgeId,
					ownerIds: body.ownerIds,
				});

				notify({
					userIds: diff(oldOwners, body.ownerIds),
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
				assertUnreachable(body);
			}
		}

		throw redirect(badgePage(badgeId));
	},
);
