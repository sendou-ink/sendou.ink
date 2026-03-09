import { tournamentTeamPage } from "~/utils/urls";
import { TeamWithRoster } from "../components/TeamWithRoster";
import { getBracketProgressionLabel } from "../tournament-utils";
import { useTournament } from "./to.$id";

export default function TournamentTeamsPage() {
	const tournament = useTournament();

	const perBracketSeedCounters = new Map<number, number>();
	const teamSeedInfo = tournament.ctx.teams.map((team, globalIndex) => {
		if (!tournament.isMultiStartingBracket) {
			return { seed: globalIndex + 1, bracketLabel: undefined };
		}

		const bracketIdx = team.startingBracketIdx ?? 0;
		const currentSeed = (perBracketSeedCounters.get(bracketIdx) ?? 0) + 1;
		perBracketSeedCounters.set(bracketIdx, currentSeed);

		const bracketLabel = getBracketProgressionLabel(
			bracketIdx,
			tournament.ctx.settings.bracketProgression,
		);

		return { seed: currentSeed, bracketLabel };
	});

	return (
		<div className="stack lg">
			{tournament.ctx.teams.map((team, i) => {
				const { seed, bracketLabel } = teamSeedInfo[i];

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
		</div>
	);
}
