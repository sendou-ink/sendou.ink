import { useLoaderData } from "react-router";
import { Pagination } from "~/components/Pagination";
import { Redirect } from "~/components/Redirect";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import { tournamentDivisionsPage, tournamentTeamPage } from "~/utils/urls";
import { TeamWithRoster } from "../components/TeamWithRoster";
import type { TournamentTeamsLoaderData } from "../loaders/to.$id.teams.server";
import { tournamentTeamsSearchParams } from "../tournament-search-params";
import { getBracketProgressionLabel } from "../tournament-utils";
import { useHasChildTournaments, useTournament } from "./to.$id";

export { loader } from "../loaders/to.$id.teams.server";

export default function TournamentTeamsPage() {
	const tournament = useTournament();
	const hasChildTournaments = useHasChildTournaments();
	const data = useLoaderData<TournamentTeamsLoaderData>();
	const pagination = useSearchParamPagination({
		definition: tournamentTeamsSearchParams,
		currentPage: data.currentPage,
		pagesCount: data.pagesCount,
	});

	if (tournament.isLeagueSignup && hasChildTournaments) {
		return <Redirect to={tournamentDivisionsPage(tournament.ctx.id)} />;
	}

	const seedInfoByTeamId = teamSeedInfo(tournament);

	return (
		<div className="stack lg">
			{data.teams.map((team) => {
				const { seed, bracketLabel } = seedInfoByTeamId.get(team.id) ?? {};

				return (
					<TeamWithRoster
						key={team.id}
						team={team}
						seed={seed}
						bracketLabel={bracketLabel}
						teamPageUrl={tournamentTeamPage({
							tournamentId: tournament.ctx.id,
							tournamentTeamId: team.id,
						})}
					/>
				);
			})}
			{data.pagesCount > 1 ? <Pagination {...pagination} /> : null}
		</div>
	);
}

function teamSeedInfo(tournament: ReturnType<typeof useTournament>) {
	const perBracketSeedCounters = new Map<number, number>();

	return new Map(
		tournament.ctx.teams.map((team, globalIndex) => {
			if (!tournament.isMultiStartingBracket) {
				return [
					team.id,
					{
						seed: globalIndex + 1,
						bracketLabel: undefined as string | undefined,
					},
				] as const;
			}

			const bracketIdx = team.startingBracketIdx ?? 0;
			const currentSeed = (perBracketSeedCounters.get(bracketIdx) ?? 0) + 1;
			perBracketSeedCounters.set(bracketIdx, currentSeed);

			return [
				team.id,
				{
					seed: currentSeed,
					bracketLabel: getBracketProgressionLabel(
						bracketIdx,
						tournament.ctx.settings.bracketProgression,
					),
				},
			] as const;
		}),
	);
}
