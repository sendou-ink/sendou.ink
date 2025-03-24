import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { currentSeason } from "~/features/mmr/season";
import { notify } from "~/features/notifications/core/notify.server";
import * as QMatchRepository from "~/features/sendouq-match/QMatchRepository.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import invariant from "~/utils/invariant";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import { hasGroupManagerPerms } from "../core/groups";
import { FULL_GROUP_SIZE } from "../q-constants";
import { preparingSchema } from "../q-schemas.server";
import { addMember } from "../queries/addMember.server";
import { findCurrentGroupByUserId } from "../queries/findCurrentGroupByUserId.server";
import { refreshGroup } from "../queries/refreshGroup.server";
import { setGroupAsActive } from "../queries/setGroupAsActive.server";

export type SendouQPreparingAction = typeof action;

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: preparingSchema,
	});

	const currentGroup = findCurrentGroupByUserId(user.id);
	errorToastIfFalsy(currentGroup, "No group found");

	if (!hasGroupManagerPerms(currentGroup.role)) {
		return null;
	}

	const season = currentSeason(new Date());
	errorToastIfFalsy(season, "Season is not active");

	switch (data._action) {
		case "JOIN_QUEUE": {
			if (currentGroup.status !== "PREPARING") {
				return null;
			}

			setGroupAsActive(currentGroup.id);
			refreshGroup(currentGroup.id);

			return redirect(SENDOUQ_LOOKING_PAGE);
		}
		case "ADD_TRUSTED": {
			const available = await QRepository.findActiveGroupMembers();
			if (available.some(({ userId }) => userId === data.id)) {
				return { error: "taken" } as const;
			}

			errorToastIfFalsy(
				(await QRepository.usersThatTrusted(user.id)).trusters.some(
					(trusterUser) => trusterUser.id === data.id,
				),
				"Not trusted",
			);

			const ownGroupWithMembers = await QMatchRepository.findGroupById({
				groupId: currentGroup.id,
			});
			invariant(ownGroupWithMembers, "No own group found");
			errorToastIfFalsy(
				ownGroupWithMembers.members.length < FULL_GROUP_SIZE,
				"Group is full",
			);

			addMember({
				groupId: currentGroup.id,
				userId: data.id,
				role: "MANAGER",
			});

			await QRepository.refreshTrust({
				trustGiverUserId: data.id,
				trustReceiverUserId: user.id,
			});

			notify({
				userIds: [data.id],
				notification: {
					type: "SQ_ADDED_TO_GROUP",
					meta: {
						adderUsername: user.username,
					},
				},
			});

			return null;
		}
		default: {
			assertUnreachable(data);
		}
	}
};
