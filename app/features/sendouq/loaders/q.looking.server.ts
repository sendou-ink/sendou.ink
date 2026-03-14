import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { cachedStreams } from "~/features/sendouq-streams/core/streams.server";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import { groupExpiryStatus } from "../core/groups";
import { SendouQ } from "../core/SendouQ.server";
import * as PrivateUserNoteRepository from "../PrivateUserNoteRepository.server";
import { sqRedirectIfNeeded } from "../q-utils.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();

	const isPreview =
		new URL(request.url).searchParams.get("preview") === "true" &&
		user.roles.includes("SUPPORTER");

	const privateNotes = await PrivateUserNoteRepository.byAuthorUserId(
		user.id,
		SendouQ.usersInQueue,
	);

	const ownGroup = SendouQ.findOwnGroup(user.id);
	const groups =
		isPreview && !ownGroup
			? SendouQ.previewGroups(user.id, privateNotes)
			: SendouQ.lookingGroups(user.id, privateNotes);

	if (!isPreview) {
		sqRedirectIfNeeded({
			ownGroup,
			currentLocation: "looking",
		});
	}

	if (ownGroup?.chatCode) {
		const memberIds = ownGroup.members.map((m: { id: number }) => m.id);

		ChatSystemMessage.setMetadata({
			chatCode: ownGroup.chatCode,
			header: `Group (${memberIds.length}/4)`,
			subtitle: "SendouQ",
			url: SENDOUQ_LOOKING_PAGE,
			participantUserIds: memberIds,
			expiresAfter: { hours: 2 },
		});
	}

	return {
		groups:
			ownGroup && groupExpiryStatus(ownGroup.latestActionAt) === "EXPIRED"
				? []
				: groups,
		ownGroup,
		likes: ownGroup
			? await SQGroupRepository.allLikesByGroupId(ownGroup.id)
			: {
					given: [],
					received: [],
				},
		lastUpdated: Date.now(),
		streamsCount: (await cachedStreams()).length,
	};
};
