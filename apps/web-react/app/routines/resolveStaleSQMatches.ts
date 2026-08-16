import { sub } from "date-fns";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { refreshStreamsCache } from "~/features/sendouq-streams/core/streams.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

const RESOLVE_UNFINISHED_AFTER_HOURS = 24;

export const ResolveStaleSQMatchesRoutine = new Routine({
	name: "ResolveStaleSQMatches",
	func: async () => {
		const staleMatches =
			await SQMatchRepository.findUnfinishedMatchesCreatedBefore(
				sub(new Date(), { hours: RESOLVE_UNFINISHED_AFTER_HOURS }),
			);
		if (staleMatches.length === 0) return;

		let canceledCount = 0;
		let confirmedCount = 0;
		for (const staleMatch of staleMatches) {
			const result = await SQMatchRepository.resolveUnfinishedMatch(
				staleMatch.id,
			);
			if (result.status === "ALREADY_LOCKED") continue;

			if (result.status === "CANCELED") canceledCount++;
			if (result.status === "CONFIRMED") confirmedCount++;

			if (staleMatch.chatCode) {
				ChatSystemMessage.send({
					room: staleMatch.chatCode,
					revalidateOnly: true,
				});
			}
		}

		if (confirmedCount > 0) {
			const season = Seasons.currentOrPrevious();
			if (season) {
				try {
					await refreshUserSkills(season.nth);
				} catch (error) {
					logger.warn("Error refreshing user skills", error);
				}
			}
			refreshStreamsCache();
		}

		await refreshSendouQInstance();

		logger.info(
			`Resolved stale SendouQ matches: ${canceledCount} canceled, ${confirmedCount} auto-confirmed`,
		);
	},
});
