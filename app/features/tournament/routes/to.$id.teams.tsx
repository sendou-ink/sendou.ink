import { tournamentTeamPage } from "~/utils/urls";
import { TeamWithRoster } from "../components/TeamWithRoster";
import { useTournament } from "./to.$id";

export default function TournamentTeamsPage() {
	const tournament = useTournament();

	return (
		<div className="stack lg">
			{tournament.ctx.teams.map((team, i) => {
				return (
					<TeamWithRoster
						key={team.id}
						team={team}
						seed={i + 1}
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
