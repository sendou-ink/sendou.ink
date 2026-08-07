import { subMinutes } from "date-fns";
import * as ReadyCheck from "~/features/sendouq/core/ready-check.server";
import { SENDOUQ } from "~/features/sendouq/q-constants";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

/** Backstop for ready checks nobody was around to run out the clock on in the browser. */
export const ExpireReadyChecksRoutine = new Routine({
	name: "ExpireReadyChecks",
	func: async () => {
		const readyChecks = await SQGroupRepository.findAllReadyChecksStartedBefore(
			subMinutes(new Date(), SENDOUQ.READY_CHECK_MINUTES),
		);

		for (const readyCheck of readyChecks) {
			await ReadyCheck.expire(readyCheck);
		}

		logger.info(`Expired ${readyChecks.length} ready check(s)`);
	},
});
