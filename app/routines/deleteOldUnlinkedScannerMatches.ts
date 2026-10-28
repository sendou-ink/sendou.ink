import { subDays } from "date-fns";
import * as ScannerIngestRepository from "../features/scanner-ingest/ScannerIngestRepository.server";
import { dateToDatabaseTimestamp } from "../utils/dates";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

/** Long after its game was played, a match that never linked won't anymore. */
const UNLINKED_RETENTION_DAYS = 30;

export const DeleteOldUnlinkedScannerMatchesRoutine = new Routine({
	name: "DeleteOldUnlinkedScannerMatches",
	func: async () => {
		const { numDeletedRows } =
			await ScannerIngestRepository.deleteUnlinkedMatchesCreatedBefore(
				dateToDatabaseTimestamp(subDays(new Date(), UNLINKED_RETENTION_DAYS)),
			);

		logger.info(`Deleted ${numDeletedRows} old unlinked scanner matches`);
	},
});
