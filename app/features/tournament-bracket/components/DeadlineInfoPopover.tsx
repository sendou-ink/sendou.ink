import clsx from "clsx";
import { differenceInSeconds } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { InfoPopover } from "~/components/InfoPopover";
import * as Deadline from "../core/Deadline";
import styles from "../tournament-bracket.module.css";

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
			<span
				className={clsx(
					styles.deadlineIndicator,
					styles.deadlineIndicatorWarning,
				)}
			>
				!
			</span>
		) : status === "error" ? (
			<span
				className={clsx(
					styles.deadlineIndicator,
					styles.deadlineIndicatorError,
				)}
			>
				!
			</span>
		) : null;

	return (
		<div className={styles.deadlinePopover}>
			<InfoPopover tiny className={styles.deadlinePopoverTrigger}>
				{t("tournament:match.deadline.explanation")}
			</InfoPopover>
			{warningIndicator}
		</div>
	);
}
