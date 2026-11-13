import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<
	typeof TournamentStationRepository.moveMatch
>[0] & {
	stationId: number;
};

/** Queues a match on a station, last in its queue unless `index` says otherwise, as the stations board does. */
export const { create } = defineFactory({
	defaults: () => ({ index: Number.MAX_SAFE_INTEGER }),
	insert: async (args: InsertArgs) => {
		await TournamentStationRepository.moveMatch(args);

		return { matchId: args.matchId, stationId: args.stationId };
	},
});
