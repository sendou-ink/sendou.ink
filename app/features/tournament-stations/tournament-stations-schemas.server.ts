import * as v from "valibot";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { superRefineAsync } from "~/utils/schema";
import * as TournamentStationRepository from "./TournamentStationRepository.server";
import { stationsFormSchema } from "./tournament-stations-schemas";

/** {@link stationsFormSchema} plus the rule needing the tournament: edited stations must be its own. */
export function stationsFormSchemaServer({
	tournament,
}: {
	tournament: Tournament;
}) {
	return v.pipeAsync(
		stationsFormSchema,
		superRefineAsync(async (data, ctx) => {
			if (data.stations.every((station) => !station.stationId)) return;

			const stationIds = (
				await TournamentStationRepository.findAllByTournamentId(
					tournament.ctx.id,
				)
			).map((station) => station.id);

			for (const [index, station] of data.stations.entries()) {
				if (station.stationId && !stationIds.includes(station.stationId)) {
					ctx.addIssue({
						message: "Unknown station",
						path: ["stations", index, "name"],
					});
				}
			}
		}),
	);
}
