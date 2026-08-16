import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { cachedStreams } from "~/features/sendouq-streams/core/streams.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { groupExpiryStatus } from "../core/groups";
import { SendouQ, sqRedirectIfNeeded } from "../core/SendouQ.server";
import { qLookingSearchParams } from "../q-search-params";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const user = requireUser();

	const { preview } = qLookingSearchParams.parse(url);
	const isPreview = preview && user.roles.includes("SUPPORTER");

	const ownGroup = SendouQ.findOwnGroup(user.id);
	const groups =
		isPreview && !ownGroup
			? SendouQ.previewGroups(user.id)
			: SendouQ.lookingGroups(user.id);

	if (!isPreview) {
		await sqRedirectIfNeeded({
			ownGroup,
			currentLocation: "looking",
		});
	}

	if (ownGroup) {
		await resolveNotifications({
			userIds: [user.id],
			type: "SQ_ADDED_TO_GROUP",
		});
	}

	const groupsToShow =
		ownGroup && groupExpiryStatus(ownGroup.latestActionAt) === "EXPIRED"
			? []
			: groups;

	const cardUserIds = R.unique([
		...(ownGroup?.members ?? []).map((member) => member.id),
		...groupsToShow.flatMap((group) =>
			(group.members ?? []).map((member) => member.id),
		),
	]);

	return {
		...(await UserCardRepository.findAllByUserIdsCached({
			userIds: cardUserIds,
		})),
		groups: groupsToShow,
		ownGroup,
		likes: ownGroup
			? await SQGroupRepository.findAllLikesByGroupId(ownGroup.id)
			: {
					given: [],
					received: [],
				},
		suggestions: ownGroup
			? await SQGroupRepository.findAllSuggestionsByGroupId(ownGroup.id)
			: [],
		kickableUserIds: ownGroup
			? await SQGroupRepository.findAllMissedReadyCheckUserIdsByGroupId(
					ownGroup.id,
				)
			: [],
		lastUpdated: Date.now(),
		streamsCount: (await cachedStreams()).length,
		chatCode:
			ownGroup && ownGroup.members.length > 1 ? ownGroup.chatCode : null,
	};
};
