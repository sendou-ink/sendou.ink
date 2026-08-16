import { logger } from "@sendou/utils/logger";
import * as ArtRepository from "../features/art/ArtRepository.server";
import { Routine } from "./routine.server";

export const DeleteOrphanArtTagsRoutine = new Routine({
	name: "DeleteOrphanArtTags",
	func: async () => {
		const deletedCount = await ArtRepository.deleteOrphanTags();
		logger.info(`Deleted ${deletedCount} orphan art tags`);
	},
});
