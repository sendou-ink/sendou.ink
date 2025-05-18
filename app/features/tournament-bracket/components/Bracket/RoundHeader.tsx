import clsx from "clsx";
import type { TournamentRoundMaps } from "~/db/tables";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { resolveLeagueRoundStartDate } from "~/features/tournament/tournament-utils";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { useIsMounted } from "~/hooks/useIsMounted";
import { TOURNAMENT } from "../../../tournament/tournament-constants";
import { useDeadline } from "./useDeadline";

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

	const hasDeadline = ![
		TOURNAMENT.ROUND_NAMES.WB_FINALS,
		TOURNAMENT.ROUND_NAMES.GRAND_FINALS,
		TOURNAMENT.ROUND_NAMES.BRACKET_RESET,
		TOURNAMENT.ROUND_NAMES.FINALS,
	].includes(name as any);

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
					{hasDeadline ? <Deadline roundId={roundId} bestOf={bestOf} /> : null}
				</div>
			) : leagueRoundStartDate ? (
				<div className="elim-bracket__round-header__infos">
					<div>
						{leagueRoundStartDate.toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
						})}{" "}
						→
					</div>
				</div>
			) : (
				<div className="elim-bracket__round-header__infos invisible">
					Hidden
				</div>
			)}
		</div>
	);
}

function Deadline({ roundId, bestOf }: { roundId: number; bestOf: number }) {
	useAutoRerender("ten seconds");
	const isMounted = useIsMounted();
	const deadline = useDeadline(roundId, bestOf);

	if (!deadline) return null;

	return (
		<div
			className={clsx({
				"text-warning": isMounted && deadline < new Date(),
			})}
		>
			DL{" "}
			{deadline.toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "numeric",
			})}
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
