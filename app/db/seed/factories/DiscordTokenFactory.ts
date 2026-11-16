import { add } from "date-fns";
import * as DiscordTokenRepository from "~/features/discord/DiscordTokenRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof DiscordTokenRepository.upsert>[0];

/** Discord linked role tokens of a user, the access token valid for a week by default. */
export const { create } = defineFactory({
	defaults: ({ seq }) => ({
		accessToken: `access-token-${seq}`,
		refreshToken: `refresh-token-${seq}`,
		expiresAt: dateToDatabaseTimestamp(add(new Date(), { days: 7 })),
	}),
	insert: async (args: InsertArgs) => {
		await DiscordTokenRepository.upsert(args);

		return args;
	},
});
