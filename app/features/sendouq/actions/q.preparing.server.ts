import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { notify } from "~/features/notifications/core/notify.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import { refreshSendouQInstance, SendouQ } from "../core/SendouQ.server";
import { preparingSchema } from "../q-schemas.server";
import { setGroupChatMetadata } from "../q-utils.server";

export type SendouQPreparingAction = typeof action;

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: preparingSchema,
	});

	const ownGroup = SendouQ.findOwnGroup(user.id);
	errorToastIfFalsy(ownGroup, "No group found");

	// no perms, possibly just lost them so no more graceful degradation
	if (ownGroup.usersRole === "REGULAR") {
		return null;
	}

	const season = Seasons.current();
	errorToastIfFalsy(season, "Season is not active");

	switch (data._action) {
		case "JOIN_QUEUE": {
			await SQGroupRepository.setPreparingGroupAsActive(ownGroup.id);

			await refreshSendouQInstance();

			return redirect(SENDOUQ_LOOKING_PAGE);
		}
		case "ADD_FRIEND": {
			const available = await SQGroupRepository.findActiveGroupMembers();
			if (available.some(({ userId }) => userId === data.id)) {
				return { error: "taken" } as const;
			}

			errorToastIfFalsy(
				(await SQGroupRepository.friendsAndTeammates(user.id)).friends.some(
					(friendUser) => friendUser.id === data.id,
				),
				"Not a friend",
			);

			await SQGroupRepository.addMember(ownGroup.id, {
				userId: data.id,
				role: "MANAGER",
			});

			await refreshSendouQInstance();

			const updatedGroup = SendouQ.findOwnGroup(user.id);
			if (updatedGroup?.chatCode) {
				setGroupChatMetadata({
					chatCode: updatedGroup.chatCode,
					members: updatedGroup.members,
				});
			}

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
