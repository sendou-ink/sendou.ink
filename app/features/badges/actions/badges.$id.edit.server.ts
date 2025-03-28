import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { z } from "zod";
import { requireUserId } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import { canEditBadgeManagers, canEditBadgeOwners } from "~/permissions";
import { diff } from "~/utils/arrays";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
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
	const user = await requireUserId(request);

	const badge = notFoundIfFalsy(await BadgeRepository.findById(badgeId));

	switch (data._action) {
		case "MANAGERS": {
			errorToastIfFalsy(
				canEditBadgeManagers(user),
				"No permissions to edit managers",
			);

			const oldManagers = await BadgeRepository.findManagersByBadgeId(badgeId);

			await BadgeRepository.replaceManagers({
				badgeId,
				managerIds: data.managerIds,
			});

			const newManagers = data.managerIds.filter(
				(newManagerId) =>
					!oldManagers.some((oldManager) => oldManager.id === newManagerId),
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
			errorToastIfFalsy(
				canEditBadgeOwners({
					user,
					managers: await BadgeRepository.findManagersByBadgeId(badgeId),
				}),
				"No permissions to edit owners",
			);

			const oldOwners: number[] = (
				await BadgeRepository.findOwnersByBadgeId(badgeId)
			).flatMap((owner) => new Array(owner.count).fill(owner.id));

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
