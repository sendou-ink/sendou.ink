import type { LoaderFunctionArgs } from "react-router";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { notFound } from "~/utils/remix.server";
import * as StationsBoard from "../core/StationsBoard";
import * as StationsDisplay from "../core/StationsDisplay";
import { tournamentStationsState } from "../core/tournamentStationsState.server";
import { stationsBoardTopics } from "../tournament-stations-utils";

export type TournamentStationsDisplayLoaderData = Awaited<
	ReturnType<typeof loader>
>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, tournamentId } = await tournamentFromParams(params, {
		for: "view",
	});
	if (!tournament.isLan) notFound();

	const state = await tournamentStationsState(tournament);
	const display = tournament.ctx.isFinalized
		? { stations: [], waiting: [] }
		: StationsDisplay.build({
				tournament,
				board: StationsBoard.build({
					tournament,
					stations: state?.stations ?? [],
					placements: state?.placements ?? [],
					matchStarts: new Map(),
					now: Date.now(),
				}),
				matchStarts: state?.etas.matchStarts ?? new Map(),
			});

	return {
		tournamentId,
		loadedAt: Date.now(),
		tournamentName: tournament.ctx.name,
		logoUrl: tournament.ctx.logoUrl,
		isFinalized: Boolean(tournament.ctx.isFinalized),
		hasStarted: tournament.hasStarted,
		...display,
		// the stream listens to these, a bracket starting adds its own
		topicsKey: tournament.ctx.isFinalized
			? null
			: stationsBoardTopics(tournament).join(","),
	};
};
