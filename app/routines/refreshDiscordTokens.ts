import * as DiscordAPI from "../features/discord/core/DiscordAPI.server";
import * as DiscordTokenRepository from "../features/discord/DiscordTokenRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const RefreshDiscordTokensRoutine = new Routine({
	name: "RefreshDiscordTokens",
	func: async () => {
		const userIds = await DiscordTokenRepository.allUserIds();

		let refreshedCount = 0;
		let errorCount = 0;

		for (const userId of userIds) {
			try {
				await DiscordAPI.getAccessToken(userId);
				refreshedCount++;
			} catch {
				errorCount++;
			}
		}

		logger.info(
			`Refreshed ${refreshedCount} Discord tokens (${errorCount} errors)`,
		);
	},
});
