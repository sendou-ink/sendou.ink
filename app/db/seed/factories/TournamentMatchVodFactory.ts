import * as TournamentMatchVodRepository from "~/features/tournament-bracket/TournamentMatchVodRepository.server";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<
	typeof TournamentMatchVodRepository.insertMany
>[0][number];

/** A Twitch VoD of a cast (no user), due a check right away. */
export const { create, createMany } = defineFactory({
	defaults: ({ seq }) => ({
		userId: null,
		platform: "TWITCH" as const,
		account: `streamer_${seq}`,
		platformVideoId: String(seq),
		timestampSeconds: 0,
		viewCount: 0,
		checkAfter: 0,
	}),
	insert: async (args: InsertArgs) => {
		await TournamentMatchVodRepository.insertMany([args]);

		return args;
	},
});
