import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import { defineFactory } from "../core/defineFactory";

type Station = Parameters<
	typeof TournamentStationRepository.setStations
>[0]["stations"][number];

type InsertArgs = Omit<Station, "id"> & { tournamentId: number };

/** Adds one station after the tournament's existing ones, as the admin stations page saves them. */
export const { create, createMany } = defineFactory({
	defaults: () => ({ locationNote: null }),
	insert: async ({ tournamentId, ...station }: InsertArgs) => {
		const existing =
			await TournamentStationRepository.findAllByTournamentId(tournamentId);
		const tournament = await TournamentRepository.findById(tournamentId);

		await TournamentStationRepository.setStations({
			tournamentId,
			autoAssign: tournament?.settings.autoAssignStations ?? true,
			stations: [...existing, { ...station, id: null }],
		});

		const created =
			await TournamentStationRepository.findAllByTournamentId(tournamentId);

		return { id: created[created.length - 1].id, tournamentId };
	},
});
