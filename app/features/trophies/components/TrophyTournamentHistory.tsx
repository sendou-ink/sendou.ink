import type { TrophyTournamentsLoaderData } from "../routes/trophies.$id.tournaments";
import { TournamentSummaryRow } from "./TournamentSummaryRow";
import styles from "./TrophyTournamentHistory.module.css";

export function TrophyTournamentHistory({
	tournaments,
}: {
	tournaments: TrophyTournamentsLoaderData["tournaments"];
}) {
	return (
		<ul className={styles.list}>
			{tournaments.map((tournament) => (
				<li key={tournament.tournamentId}>
					<TournamentSummaryRow tournament={tournament} />
				</li>
			))}
		</ul>
	);
}
