import { requireUser } from "~/features/auth/core/user.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import type { SerializeFrom } from "~/utils/remix";

export type FriendsForAddingLoaderData = SerializeFrom<typeof loader>;

export const loader = async () => {
	const { id: userId } = requireUser();

	return {
		friendsForAdding: await SQGroupRepository.friendsAndTeammates(userId),
	};
};
