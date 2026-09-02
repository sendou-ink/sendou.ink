import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { chatRoomChannel } from "~/features/events/events-types";
import * as Seasons from "~/features/mmr/core/Seasons";
import { notify } from "~/features/notifications/core/notify.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import { refreshSendouQInstance, SendouQ } from "../core/SendouQ.server";
import { preparingSchema } from "../q-action-schemas";
import { SENDOUQ_LOOKING_CHANNEL, sqGroupChannel } from "../q-constants";
import { SendouQError } from "../q-utils.server";

export type SendouQPreparingAction = typeof action;

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: preparingSchema,
	});

	const ownGroup = SendouQ.findOwnGroup(user.id);
	errorToastIfFalsy(ownGroup, "No group found");

	const season = Seasons.current();
	errorToastIfFalsy(season, "Season is not active");

	try {
		switch (data._action) {
			case "JOIN_QUEUE": {
				await SQGroupRepository.setPreparingGroupAsActive(ownGroup.id);

				await refreshSendouQInstance();

				ChatSystemMessage.send({ channel: SENDOUQ_LOOKING_CHANNEL });

				return redirect(SENDOUQ_LOOKING_PAGE);
			}
			case "ADD_FRIEND": {
				const available = await SQGroupRepository.findActiveGroupMembers();
				if (available.some(({ userId }) => userId === data.id)) {
					return { error: "taken" } as const;
				}

				errorToastIfFalsy(
					(
						await SQGroupRepository.findFriendsAndTeammates(user.id)
					).friends.some((friendUser) => friendUser.id === data.id),
					"Not a friend",
				);
				errorToastIfFalsy(
					(await UserRepository.findLeanById(data.id))?.friendCode,
					"User you are trying to add has no friend code set",
				);

				const { chatRoomIdToRevalidate } = await SQGroupRepository.insertMember(
					ownGroup.id,
					{ userId: data.id },
				);

				if (chatRoomIdToRevalidate) {
					ChatSystemMessage.send({
						channel: chatRoomChannel(chatRoomIdToRevalidate),
					});
				}

				await refreshSendouQInstance();

				const updatedGroup = SendouQ.findOwnGroup(user.id);

				ChatSystemMessage.notifyRoomsChanged(
					updatedGroup
						? updatedGroup.members.map((member) => member.id)
						: [data.id],
				);

				ChatSystemMessage.send({ channel: sqGroupChannel(ownGroup.id) });

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
	} catch (error) {
		// expected errors (two requests racing to create/join a group): return null so
		// loaders re-run and the user sees the fresh state instead of an error page
		if (error instanceof SendouQError) {
			return null;
		}

		throw error;
	}
};
