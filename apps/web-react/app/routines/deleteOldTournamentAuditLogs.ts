import { logger } from "@sendou/utils/logger";
import * as TournamentAuditLogRepository from "../features/tournament/TournamentAuditLogRepository.server";
import { Routine } from "./routine.server";

export const DeleteOldTournamentAuditLogsRoutine = new Routine({
	name: "DeleteOldTournamentAuditLogs",
	func: async () => {
		const { numDeletedRows } = await TournamentAuditLogRepository.deleteOld();
		logger.info(`Deleted ${numDeletedRows} old tournament audit log entries`);
	},
});
