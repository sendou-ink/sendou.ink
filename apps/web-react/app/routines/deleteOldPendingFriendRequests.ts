import * as FriendRepository from "../features/friends/FriendRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const DeleteOldPendingFriendRequestsRoutine = new Routine({
	name: "DeleteOldPendingFriendRequests",
	func: async () => {
		const { numDeletedRows } =
			await FriendRepository.deleteOldPendingRequests();
		logger.info(`Deleted ${numDeletedRows} old pending friend requests`);
	},
});
