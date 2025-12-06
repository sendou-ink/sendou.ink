import { differenceInSeconds } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { InfoPopover } from "~/components/InfoPopover";
import * as Deadline from "../core/Deadline";

interface DeadlineInfoPopoverProps {
	startedAt: Date;
	bestOf: number;
	gamesCompleted: number;
}

export function DeadlineInfoPopover({
	startedAt,
	bestOf,
	gamesCompleted,
}: DeadlineInfoPopoverProps) {
	const { t } = useTranslation(["tournament"]);
	const [currentTime, setCurrentTime] = React.useState(new Date());

	React.useEffect(() => {
		const interval = setInterval(() => {
			setCurrentTime(new Date());
		}, 5_000);

		return () => clearInterval(interval);
	}, []);

	const elapsedMinutes = differenceInSeconds(currentTime, startedAt) / 60;

	const status = Deadline.matchStatus({
		elapsedMinutes,
		gamesCompleted,
		maxGamesCount: bestOf,
	});

	const warningIndicator =
		status === "warning" ? (
			<span className="tournament-bracket__deadline-indicator tournament-bracket__deadline-indicator__warning">
				!
			</span>
		) : status === "error" ? (
			<span className="tournament-bracket__deadline-indicator tournament-bracket__deadline-indicator__error">
				!
			</span>
		) : null;

	return (
		<div className="tournament-bracket__deadline-popover">
			<InfoPopover
				tiny
				className="tournament-bracket__deadline-popover__trigger"
			>
				{t("tournament:match.deadline.explanation")}
			</InfoPopover>
			{warningIndicator}
		</div>
	);
}
