import clsx from "clsx";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Redirect } from "~/components/Redirect";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/tournament-context";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import type { BracketMeta } from "../core/Tournament";
import styles from "./to.$id.divisions.module.css";

export default function TournamentDivisionsPage() {
	const tournament = useTournament();
	const user = useUser();

	const ownTeam = tournament.teamMemberOfByUser(user);
	const ownDivisionIdx = ownTeam ? (ownTeam.startingBracketIdx ?? 0) : null;

	if (!tournament.isLeague) {
		return (
			<Redirect
				to={tournamentBracketsPage({ tournamentId: tournament.ctx.id })}
			/>
		);
	}

	return (
		<div className={styles.grid}>
			{tournament.leagueDivisions.map((division) => (
				<DivisionLink
					key={division.idx}
					division={division}
					isParticipant={ownDivisionIdx === division.idx}
				/>
			))}
		</div>
	);
}

function DivisionLink({
	division,
	isParticipant,
}: {
	division: BracketMeta;
	isParticipant: boolean;
}) {
	const { t } = useTranslation(["calendar"]);
	const tournament = useTournament();

	return (
		<Link
			to={tournamentBracketsPage({
				tournamentId: tournament.ctx.id,
				divisionIdx: division.idx,
			})}
			className={clsx(styles.link, {
				[styles.participant]: isParticipant,
			})}
			data-testid="division-link"
		>
			{division.name}
			<div className={styles.participantCounts}>
				<Users />{" "}
				{t("calendar:count.teams", {
					count: tournament.teamsCountOfBracket(division.idx),
				})}
			</div>
		</Link>
	);
}
