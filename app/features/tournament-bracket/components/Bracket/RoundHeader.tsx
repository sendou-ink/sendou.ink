import type { TournamentRoundMaps } from "~/db/tables";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { resolveLeagueRoundStartDate } from "~/features/tournament/tournament-utils";
import { useTimeFormat } from "~/hooks/useTimeFormat";

export function RoundHeader({
	roundId,
	name,
	bestOf,
	showInfos,
	maps,
}: {
	roundId: number;
	name: string;
	bestOf?: number;
	showInfos?: boolean;
	maps?: TournamentRoundMaps | null;
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
			<div className="elim-bracket__round-header">{name}</div>
			{showInfos && bestOf && !leagueRoundStartDate ? (
				<div className="elim-bracket__round-header__infos">
					<div>
						{countPrefix}
						{bestOf}
						{pickBanSuffix}
					</div>
				</div>
			) : leagueRoundStartDate ? (
				<LeagueRoundStartDate date={leagueRoundStartDate} />
			) : (
				<div className="elim-bracket__round-header__infos invisible">
					Hidden
				</div>
			)}
		</div>
	);
}

function LeagueRoundStartDate({ date }: { date: Date }) {
	const { formatDate } = useTimeFormat();

	return (
		<div className="elim-bracket__round-header__infos">
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

function useLeagueWeekStart(roundId: number) {
	const tournament = useTournament();

	const bracketIdx = tournament.brackets.findIndex((b) =>
		b.data.round.some((r) => r.id === roundId),
	);
	if (bracketIdx !== 0) return null;

	return resolveLeagueRoundStartDate(tournament, roundId);
}
