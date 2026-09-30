import { clsx } from "clsx";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { TierPill } from "~/components/TierPill";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useFormatDistanceToNow } from "~/hooks/intl/useFormatDistanceToNow";
import { useHydrated } from "~/hooks/useHydrated";
import { databaseTimestampToDate } from "~/utils/dates";
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
	const { t } = useTranslation(["trophies"]);
	const isHydrated = useHydrated();
	const formatDistanceToNow = useFormatDistanceToNow();
	const { formatter } = useDateTimeFormat({
		day: "numeric",
		month: "short",
		year: "numeric",
	});

	const isUpcoming = Boolean(
		tournament.startTime &&
			databaseTimestampToDate(tournament.startTime) > new Date(),
	);

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
					{isUpcoming ? (
						<span className={styles.upcomingPill}>
							{t("trophies:details.upcoming")}
						</span>
					) : null}
				</span>
				<div className={styles.meta}>
					<span className={styles.metaItem}>
						<Users className={styles.metaIcon} />
						{tournament.teamsCount}
					</span>
					{tournament.startTime ? (
						isUpcoming ? (
							<time
								className={clsx(styles.metaItem, {
									invisible: !isHydrated,
								})}
								dateTime={databaseTimestampToDate(
									tournament.startTime,
								).toISOString()}
							>
								{isHydrated
									? formatDistanceToNow(tournament.startTime, {
											addSuffix: true,
										})
									: "Placeholder"}
							</time>
						) : (
							<span className={styles.metaItem}>
								{formatter.format(tournament.startTime)}
							</span>
						)
					) : null}
				</div>
			</div>
		</Link>
	);
}
