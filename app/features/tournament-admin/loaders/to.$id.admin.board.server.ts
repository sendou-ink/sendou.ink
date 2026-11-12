import { type LoaderFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import {
	showsOneGroupAtATime,
	tournamentBracketChannel,
	tournamentChannel,
} from "~/features/tournament-bracket/tournament-bracket-utils";
import * as StationsBoard from "~/features/tournament-stations/core/StationsBoard";
import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import { tournamentStationsChannel } from "~/features/tournament-stations/tournament-stations-utils";
import { tournamentPage } from "~/utils/urls";

export type TournamentAdminBoardLoaderData = Awaited<ReturnType<typeof loader>>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { tournament, tournamentId } = await tournamentFromParams(params, {
		for: "view",
	});

	if (
		!tournament.isLan ||
		tournament.ctx.isFinalized ||
		!tournament.canSeeStationsBoard(user)
	) {
		throw redirect(tournamentPage(tournamentId));
	}

	const board = StationsBoard.build({
		tournament,
		stations:
			await TournamentStationRepository.findAllByTournamentId(tournamentId),
		queuedMatches:
			await TournamentStationRepository.findQueuedMatchesByTournamentId(
				tournamentId,
			),
	});

	return {
		...board,
		canEdit: tournament.isOrganizerOrStreamer(user),
		topics: [
			tournamentChannel(tournamentId),
			tournamentStationsChannel(tournamentId),
			...tournament.brackets
				.filter((bracket) => !bracket.preview)
				.flatMap((bracket) => {
					const progression =
						tournament.ctx.settings.bracketProgression[bracket.idx];

					const groupIds = showsOneGroupAtATime(progression)
						? bracket.data.group.map((group) => group.id)
						: [null];

					return groupIds.map((groupId) =>
						tournamentBracketChannel({
							tournamentId,
							bracketIdx: bracket.idx,
							groupId,
						}),
					);
				}),
		],
	};
};
