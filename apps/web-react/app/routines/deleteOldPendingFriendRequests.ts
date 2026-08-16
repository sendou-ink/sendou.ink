import { logger } from "@sendou/utils/logger";
import * as FriendRepository from "../features/friends/FriendRepository.server";
import { Routine } from "./routine.server";

export const DeleteOldPendingFriendRequestsRoutine = new Routine({
	name: "DeleteOldPendingFriendRequests",
	func: async () => {
		const { numDeletedRows } =
			await FriendRepository.deleteOldPendingRequests();
		logger.info(`Deleted ${numDeletedRows} old pending friend requests`);
	},
});
