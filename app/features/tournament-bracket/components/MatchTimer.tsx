import { clsx } from "clsx";
import { differenceInSeconds } from "date-fns";
import * as React from "react";
import * as Deadline from "../core/Deadline";
import styles from "./MatchTimer.module.css";

interface MatchTimerProps {
	startedAt: Date;
	bestOf: number;
}

export function MatchTimer({ startedAt, bestOf }: MatchTimerProps) {
	const [currentTime, setCurrentTime] = React.useState(new Date());

	React.useEffect(() => {
		const interval = setInterval(() => {
			setCurrentTime(new Date());
		}, 5_000);

		return () => clearInterval(interval);
	}, []);

	const elapsedMinutes = differenceInSeconds(currentTime, startedAt) / 60;

	const totalMinutes = Deadline.totalMatchTime(bestOf);
	const progressPercentage = Deadline.progressPercentage(
		elapsedMinutes,
		totalMinutes,
	);
	const gameMarkers = Deadline.gameMarkers(bestOf);

	return (
		<div data-testid="match-timer">
			<div className={styles.progressContainer}>
				<div
					className={styles.progressBar}
					style={{
						width: `${Math.min(progressPercentage, 100)}%`,
					}}
				/>

				{gameMarkers.map((marker) => (
					<div
						key={marker.gameNumber}
						className={clsx(styles.gameMarker, {
							[styles.gameMarkerHidden]: marker.gameNumber !== 1,
						})}
						style={{ left: `${marker.percentage}%` }}
					>
						<div
							className={clsx(styles.gameMarkerText, styles.gameMarkerLabel)}
						>
							G{marker.gameNumber}
						</div>
						<div className={styles.gameMarkerLine} />
						<div
							className={clsx(styles.gameMarkerText, styles.gameMarkerLabel)}
						>
							Start
						</div>
					</div>
				))}

				<div className={styles.maxTimeMarker}>
					<div className={clsx(styles.gameMarkerText, styles.gameMarkerTime)}>
						Max
					</div>
					<div className={clsx(styles.gameMarkerText, styles.gameMarkerTime)}>
						{totalMinutes}min
					</div>
				</div>
			</div>
		</div>
	);
}
