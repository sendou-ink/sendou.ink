import { Users } from "lucide-react";
import { Link } from "react-router";
import { TierPill } from "~/components/TierPill";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { tournamentPage } from "~/utils/urls";
import type { TrophyTournamentsLoaderData } from "../routes/trophies.$id.tournaments";
import styles from "./TrophyTournamentHistory.module.css";

export function TrophyTournamentHistory({
	tournaments,
}: {
	tournaments: TrophyTournamentsLoaderData["tournaments"];
}) {
	return (
		<ul className={styles.list}>
			{tournaments.map((tournament) => (
				<TournamentHistoryEntry
					key={tournament.tournamentId}
					tournament={tournament}
				/>
			))}
		</ul>
	);
}

function TournamentHistoryEntry({
	tournament,
}: {
	tournament: TrophyTournamentsLoaderData["tournaments"][number];
}) {
	const { formatter } = useDateTimeFormat({
		day: "numeric",
		month: "short",
		year: "numeric",
	});

	return (
		<li>
			<Link
				to={tournamentPage(tournament.tournamentId)}
				className={styles.entry}
			>
				<img
					src={tournament.logoUrl}
					alt=""
					width={32}
					height={32}
					className={styles.logo}
				/>
				<div className="stack xxs">
					<span className={styles.name}>
						<p>{tournament.name}</p>
						{tournament.tier ? (
							<TierPill tier={tournament.tier} />
						) : tournament.tentativeTier ? (
							<TierPill tier={tournament.tentativeTier} isTentative />
						) : null}
					</span>
					<div className={styles.meta}>
						<span className={styles.metaItem}>
							<Users className={styles.metaIcon} />
							{tournament.teamsCount}
						</span>
						{tournament.startTime ? (
							<span className={styles.metaItem}>
								{formatter.format(tournament.startTime)}
							</span>
						) : null}
					</div>
				</div>
			</Link>
		</li>
	);
}
