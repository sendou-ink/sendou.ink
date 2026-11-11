import * as v from "valibot";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { superRefine, superRefineAsync } from "~/utils/schema";
import * as TournamentStationRepository from "./TournamentStationRepository.server";
import { stationsFormSchema } from "./tournament-stations-schemas";

/** {@link stationsFormSchema} plus the rules needing the tournament: edited stations and linked cast accounts must be its own. */
export function stationsFormSchemaServer({
	tournament,
}: {
	tournament: Tournament;
}) {
	const castAccountKeys = (tournament.ctx.castAccounts ?? []).map(
		LiveStream.key,
	);

	return v.pipeAsync(
		stationsFormSchema,
		superRefine((data, ctx) => {
			for (const [index, station] of data.stations.entries()) {
				if (
					station.castAccount &&
					!castAccountKeys.includes(station.castAccount)
				) {
					ctx.addIssue({
						message: "forms:errors.stationCastAccountUnknown",
						path: ["stations", index, "castAccount"],
					});
				}
			}
		}),
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
