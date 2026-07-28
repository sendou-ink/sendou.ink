import type { Tables } from "~/db/tables";
import * as LiveStreamRepository from "~/features/live-streams/LiveStreamRepository.server";
import invariant from "~/utils/invariant";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Omit<Tables["TournamentStreamer"], "id">;

export const { create } = defineFactory({
	defaults: ({ seq }) => ({
		twitchAccount: `streamer_${seq}`,
		userId: null,
	}),
	insert: async (args: InsertArgs) => {
		const [row] = await LiveStreamRepository.insertTournamentStreamers([args]);

		invariant(
			row,
			`${args.twitchAccount} is already a streamer of tournament ${args.tournamentId}`,
		);

		return row;
	},
});
