import clsx from "clsx";
import { differenceInMinutes } from "date-fns";
import * as React from "react";
import type { TournamentRoundMaps } from "~/db/tables";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { resolveLeagueRoundStartDate } from "~/features/tournament/tournament-utils";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import type { Unpacked } from "~/utils/types";
import * as Deadline from "../../core/Deadline";
import type { TournamentData } from "../../core/Tournament.server";
import styles from "./bracket.module.css";

export function RoundHeader({
	roundId,
	name,
	bestOf,
	showInfos,
	maps,
	roundStartedAt = null,
	matches = [],
}: {
	roundId: number;
	name: string;
	bestOf?: number;
	showInfos?: boolean;
	maps?: TournamentRoundMaps | null;
	roundStartedAt?: number | null;
	matches?: Array<Unpacked<TournamentData["data"]["match"]>>;
}) {
	const leagueRoundStartDate = useLeagueWeekStart(roundId);

	const countPrefix = maps?.type === "PLAY_ALL" ? "Play all " : "Bo";

	const pickBanSuffix =
		maps?.pickBan === "COUNTERPICK"
			? " (C)"
			: maps?.pickBan === "BAN_2"
				? " (B)"
				: "";

	return (
		<div>
			<div className={styles.elimRoundHeader}>{name}</div>
			{showInfos && bestOf && !leagueRoundStartDate ? (
				<div className={styles.elimRoundHeaderInfos}>
					<div>
						{countPrefix}
						{bestOf}
						{pickBanSuffix}
					</div>
					{roundStartedAt && matches && matches.length > 0 ? (
						<RoundTimer
							startedAt={roundStartedAt}
							bestOf={bestOf}
							matches={matches}
						/>
					) : null}
				</div>
			) : leagueRoundStartDate ? (
				<LeagueRoundStartDate date={leagueRoundStartDate} />
			) : (
				<div className={clsx(styles.elimRoundHeaderInfos, "invisible")}>
					Hidden
				</div>
			)}
		</div>
	);
}

function LeagueRoundStartDate({ date }: { date: Date }) {
	const { formatDate } = useTimeFormat();

	return (
		<div className={styles.elimRoundHeaderInfos}>
			<div>
				{formatDate(date, {
					month: "short",
					day: "numeric",
				})}{" "}
				→
			</div>
		</div>
	);
}

function RoundTimer({
	startedAt,
	bestOf,
	matches,
}: {
	startedAt: number;
	bestOf: number;
	matches: Array<Unpacked<TournamentData["data"]["match"]>>;
}) {
	const [now, setNow] = React.useState(new Date());

	React.useEffect(() => {
		const interval = setInterval(() => {
			setNow(new Date());
		}, 60000);

		return () => clearInterval(interval);
	}, []);

	const elapsedMinutes = differenceInMinutes(
		now,
		databaseTimestampToDate(startedAt),
	);

	const matchStatuses = matches
		.filter((match) => match.startedAt)
		.map((match) => {
			const matchElapsedMinutes = differenceInMinutes(
				now,
				databaseTimestampToDate(match.startedAt!),
			);
			const gamesCompleted =
				(match.opponent1?.score ?? 0) + (match.opponent2?.score ?? 0);

			return Deadline.matchStatus({
				elapsedMinutes: matchElapsedMinutes,
				gamesCompleted,
				maxGamesCount: bestOf,
			});
		});

	const worstStatus = matchStatuses.includes("error")
		? "error"
		: matchStatuses.includes("warning")
			? "warning"
			: "normal";

	const displayText = elapsedMinutes >= 60 ? "1h+" : `${elapsedMinutes}m`;

	const statusColor =
		worstStatus === "error"
			? "var(--color-error)"
			: worstStatus === "warning"
				? "var(--color-warning)"
				: "var(--color-text)";

	return <div style={{ color: statusColor }}>{displayText}</div>;
}

function useLeagueWeekStart(roundId: number) {
	const tournament = useTournament();

	const bracketIdx = tournament.brackets.findIndex((b) =>
		b.data.round.some((r) => r.id === roundId),
	);
	if (bracketIdx !== 0) return null;

	return resolveLeagueRoundStartDate(tournament, roundId);
}
