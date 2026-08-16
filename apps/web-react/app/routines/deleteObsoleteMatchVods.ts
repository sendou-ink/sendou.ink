import { logger } from "@sendou/utils/logger";
import * as TournamentMatchVodRepository from "../features/tournament-bracket/TournamentMatchVodRepository.server";
import { Routine } from "./routine.server";

export const DeleteObsoleteMatchVodsRoutine = new Routine({
	name: "DeleteObsoleteMatchVods",
	func: async () => {
		const { numDeletedRows } =
			await TournamentMatchVodRepository.deleteObsolete();
		logger.info(`Deleted ${numDeletedRows} obsolete match vods`);
	},
});
