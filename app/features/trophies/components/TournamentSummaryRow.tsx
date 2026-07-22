import { clsx } from "clsx";
import { Users } from "lucide-react";
import { Link } from "react-router";
import { TierPill } from "~/components/TierPill";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { tournamentPage } from "~/utils/urls";
import styles from "./TournamentSummaryRow.module.css";

export function TournamentSummaryRow({
	tournament,
	className,
}: {
	tournament: {
		tournamentId: number;
		name: string;
		logoUrl: string;
		teamsCount: number | null;
		tier?: number | null;
		tentativeTier?: number | null;
		startTime?: number | null;
	};
	className?: string;
}) {
	const { formatter } = useDateTimeFormat({
		day: "numeric",
		month: "short",
		year: "numeric",
	});

	return (
		<Link
			to={tournamentPage(tournament.tournamentId)}
			className={clsx(styles.row, className)}
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
	);
}
