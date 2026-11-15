import { type LoaderFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import * as StationsBoard from "~/features/tournament-stations/core/StationsBoard";
import { tournamentStationsState } from "~/features/tournament-stations/core/tournamentStationsState.server";
import { stationsBoardTopics } from "~/features/tournament-stations/tournament-stations-utils";
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

	const state = await tournamentStationsState(tournament);
	const board = StationsBoard.build({
		tournament,
		stations: state?.stations ?? [],
		placements: state?.placements ?? [],
		matchStarts: state?.etas.matchStarts ?? new Map(),
		now: Date.now(),
	});

	return {
		...board,
		canEdit: tournament.isOrganizerOrStreamer(user),
		topics: stationsBoardTopics(tournament),
	};
};
