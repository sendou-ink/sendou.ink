import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { cachedStreams } from "~/features/sendouq-streams/core/streams.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { groupExpiryStatus } from "../core/groups";
import { SendouQ } from "../core/SendouQ.server";
import { sqRedirectIfNeeded } from "../q-utils.server";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const user = requireUser();

	const isPreview =
		url.searchParams.get("preview") === "true" &&
		user.roles.includes("SUPPORTER");

	const ownGroup = SendouQ.findOwnGroup(user.id);
	const groups =
		isPreview && !ownGroup
			? SendouQ.previewGroups(user.id)
			: SendouQ.lookingGroups(user.id);

	if (!isPreview) {
		sqRedirectIfNeeded({
			ownGroup,
			currentLocation: "looking",
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
		...(await UserCardRepository.userCards({
			userIds: cardUserIds,
			viewerId: user.id,
		})),
		groups: groupsToShow,
		ownGroup,
		likes: ownGroup
			? await SQGroupRepository.allLikesByGroupId(ownGroup.id)
			: {
					given: [],
					received: [],
				},
		lastUpdated: Date.now(),
		streamsCount: (await cachedStreams()).length,
		chatCode:
			ownGroup && ownGroup.members.length > 1 ? ownGroup.chatCode : null,
	};
};
