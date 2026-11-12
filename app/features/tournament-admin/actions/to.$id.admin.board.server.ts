import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import * as StationsBoard from "~/features/tournament-stations/core/StationsBoard";
import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import { stationsBoardActionSchema } from "~/features/tournament-stations/tournament-stations-schemas";
import { tournamentStationsChannel } from "~/features/tournament-stations/tournament-stations-utils";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy } from "~/utils/remix.server";

export const action = defineAction(
	{ body: stationsBoardActionSchema },
	async ({ params, body }) => {
		const { tournament, tournamentId, user } = await tournamentFromParams(
			params,
			{ for: "action" },
		);
		errorToastIfFalsy(
			tournament.isOrganizerOrStreamer(user),
			"Only organizers and streamers can move matches",
		);
		errorToastIfFalsy(
			tournament.isLan && !tournament.ctx.isFinalized,
			"Stations can't be edited",
		);

		errorToastIfFalsy(
			tournament.matchIdToBracketIdx(body.matchId) !== null &&
				tournament.matchStatusById(body.matchId) !== "COMPLETED",
			"Match not found or already finished",
		);

		const stationId = body.stationId ?? null;
		if (stationId !== null) {
			const stations =
				await TournamentStationRepository.findAllByTournamentId(tournamentId);
			errorToastIfFalsy(
				stations.some((station) => station.id === stationId),
				"Unknown station",
			);
		}

		await TournamentStationRepository.moveMatch({
			matchId: body.matchId,
			stationId,
			index: body.index,
			audit: {
				tournamentId,
				matchName: StationsBoard.matchName(tournament, body.matchId),
			},
		});

		ChatSystemMessage.send({
			channel: tournamentStationsChannel(tournamentId),
		});

		return null;
	},
);
