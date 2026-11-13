import type { Params } from "react-router";
import {
	clearTournamentDataCache,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import { stationsFormSchemaServer } from "~/features/tournament-stations/tournament-stations-schemas.server";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy } from "~/utils/remix.server";

export const action = defineAction(
	{ body: stationsBodySchema },
	async ({ params, body }) => {
		const { tournament, tournamentId } = await tournamentFromParams(params, {
			for: "organizer",
		});
		errorToastIfFalsy(
			tournament.isLan && !tournament.ctx.isFinalized,
			"Stations can't be edited",
		);

		await TournamentStationRepository.setStations({
			tournamentId,
			autoAssign: body.autoAssign,
			stations: body.stations.map((station) => ({
				id: station.stationId ?? null,
				name: station.name,
				locationNote: station.locationNote,
			})),
		});

		clearTournamentDataCache(tournamentId);

		return null;
	},
);

async function stationsBodySchema({ params }: { params: Params<string> }) {
	const { tournament } = await tournamentFromParams(params, {
		for: "organizer",
	});

	return stationsFormSchemaServer({ tournament });
}
