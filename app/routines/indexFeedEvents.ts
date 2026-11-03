import * as FeedIndexer from "~/features/feed/core/FeedIndexer.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const IndexFeedEventsRoutine = new Routine({
	name: "IndexFeedEvents",
	func: async () => {
		const { userCount } = await FeedIndexer.run();
		logger.info(`Indexed feed events of ${userCount} users`);
	},
});
