import { useLoaderData } from "react-router";
import { Pagination } from "~/components/Pagination";
import { useTournament } from "~/features/tournament/tournament-context";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import { tournamentTeamPage } from "~/utils/urls";
import { TeamWithRoster } from "../components/TeamWithRoster";
import type { TournamentTeamsLoaderData } from "../loaders/to.$id.teams.server";
import { tournamentTeamsSearchParams } from "../tournament-search-params";

export { loader } from "../loaders/to.$id.teams.server";

export default function TournamentTeamsPage() {
	const tournament = useTournament();
	const data = useLoaderData<TournamentTeamsLoaderData>();
	const pagination = useSearchParamPagination({
		definition: tournamentTeamsSearchParams,
		currentPage: data.currentPage,
		pagesCount: data.pagesCount,
	});

	return (
		<div className="stack lg">
			{data.teams.map((team) => (
				<TeamWithRoster
					key={team.id}
					team={team}
					seed={team.seedInfo?.seed}
					bracketLabel={team.seedInfo?.bracketLabel}
					teamPageUrl={tournamentTeamPage({
						tournamentId: tournament.ctx.id,
						tournamentTeamId: team.id,
					})}
				/>
			))}
			{data.pagesCount > 1 ? <Pagination {...pagination} /> : null}
		</div>
	);
}
