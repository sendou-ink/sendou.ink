import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { setMetadata } from "~/features/chat/ChatSystemMessage.server";
import { SENDOUQ_MATCH_EXPIRY_MS } from "~/features/chat/chat-constants";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { cachedStreams } from "~/features/sendouq-streams/core/streams.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
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
		const chatUsers = await UserRepository.findChatUsersByUserIds(memberIds);

		setMetadata({
			chatCode: ownGroup.chatCode,
			header: "SQ Group",
			// xxx: better subtitle
			subtitle: "Looking for match",
			url: "/q/looking",
			participantUserIds: memberIds,
			chatUsers,
			expiresAt: Date.now() + SENDOUQ_MATCH_EXPIRY_MS,
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
