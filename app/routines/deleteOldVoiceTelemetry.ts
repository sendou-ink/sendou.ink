import { subDays } from "date-fns";
import * as VoiceRepository from "../features/voice/VoiceRepository.server";
import { dateToDatabaseTimestamp } from "../utils/dates";
import { Routine } from "./routine.server";

const SESSION_RETENTION_DAYS = 180;
const ERROR_RETENTION_DAYS = 90;

export const DeleteOldVoiceTelemetryRoutine = new Routine({
	name: "DeleteOldVoiceTelemetry",
	func: async () => {
		await VoiceRepository.deleteOlderThan({
			sessionsBefore: dateToDatabaseTimestamp(
				subDays(new Date(), SESSION_RETENTION_DAYS),
			),
			errorsBefore: dateToDatabaseTimestamp(
				subDays(new Date(), ERROR_RETENTION_DAYS),
			),
		});
	},
});
